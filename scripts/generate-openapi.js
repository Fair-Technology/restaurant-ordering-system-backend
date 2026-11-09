#!/usr/bin/env node
/**
 * Generates the API's OpenAPI specification from the code, so the published spec
 * cannot drift from the routes that actually exist.
 *
 * Azure Functions (Node v4) ships no OpenAPI generation, unlike .NET or Python v2,
 * so this reads the registrations and the application services directly. The code
 * is uniform enough for that to be reliable:
 *   - every function registers with app.http(name, { methods, authLevel, route })
 *   - every handler body calls exactly one executeX(...) and returns its result
 *   - every application service declares Promise<ApplicationResult<XResultDto>>
 *   - a request body is whatever parameter is typed *RequestDto
 *
 * Human-readable prose (summary, description, tags) and the hand-written query
 * parameters live in src/swagger/overlay.json, keyed by operationId, and are merged
 * in. Generated content always wins for anything structural.
 *
 * Usage:
 *   node scripts/generate-openapi.js            # write src/swagger/swagger.json
 *   node scripts/generate-openapi.js --dry      # report what it found, write nothing
 */
const fs = require('fs');
const path = require('path');
const { createGenerator } = require('ts-json-schema-generator');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const FUNCTIONS_DIR = path.join(SRC, 'functions');
const APPLICATION_DIR = path.join(SRC, 'application');
const SWAGGER_DIR = path.join(SRC, 'swagger');
const OUT_FILE = path.join(SWAGGER_DIR, 'swagger.json');
const OVERLAY_FILE = path.join(SWAGGER_DIR, 'overlay.json');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');

/**
 * The few HTTP functions whose contract cannot be read off an application
 * service. Everything here is deliberate and should stay short; if this list
 * grows, the convention it papers over needs revisiting instead.
 */
const OVERRIDES = {
  // Webhooks answer Stripe, not the frontends: a bare acknowledgement.
  stripeWebhook: { response: { type: 'object', properties: { received: { type: 'boolean' } } } },
  stripeConnectWebhook: { response: { type: 'object', properties: { received: { type: 'boolean' } } } },
  // Serves the spec itself — excluded so the spec does not describe itself.
  swaggerJson: { skip: true },
  swaggerUi: { skip: true },
  getOrderByPaymentIntent: { response: 'GetOrderByPaymentIntentResultDto' },
  viewCustomerDocument: { response: { type: 'object', additionalProperties: true } },
  generateShopCoverImageUploadUrl: { response: { type: 'object', additionalProperties: true } },
  generateShopLogoUploadUrl: { response: { type: 'object', additionalProperties: true } },
};

// ── helpers ─────────────────────────────────────────────────────────────────
function walk(dir, match = (name) => name === 'index.ts', out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, match, out);
    else if (match(entry.name)) out.push(p);
  }
  return out;
}

function discoverFunctions() {
  const found = [];
  for (const file of walk(FUNCTIONS_DIR)) {
    const src = fs.readFileSync(file, 'utf8');
    const re = /app\.(http|timer)\(\s*'([^']+)'\s*,\s*\{([\s\S]*?)\n\}\);/g;
    let m;
    while ((m = re.exec(src))) {
      const [, kind, name, body] = m;
      if (kind === 'timer') continue;
      const methods = (body.match(/methods:\s*\[([^\]]*)\]/) || [, ''])[1];
      const route = (body.match(/route:\s*'([^']*)'/) || [, null])[1];
      const authLevel = (body.match(/authLevel:\s*'([^']*)'/) || [, 'anonymous'])[1];
      found.push({
        name,
        methods: methods.split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean),
        route,
        authLevel,
        body,
      });
    }
  }
  return found;
}

const applicationIndex = (() => {
  const map = new Map();
  for (const file of walk(APPLICATION_DIR, (n) => n.endsWith('.ts'))) {
    const base = path.basename(file, '.ts');
    if (base === 'dtos') continue;
    // Prefer an execute* file when a service has both (mirrors the layer's convention).
    if (!map.has(base) || base.startsWith('execute')) map.set(base, file);
    // A handler calls the exported function, whose name can differ from the file's —
    // getCustomerDocument.ts exports executeGetCustomerDocument.
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g)) {
      if (!map.has(m[1])) map.set(m[1], file);
    }
  }
  return map;
})();

/** Split on a separator that sits outside any {} [] () <> nesting. */
function splitTopLevel(text, sep = ',') {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if ('{([<'.includes(ch)) { depth++; cur += ch; continue; }
    if ('})]>'.includes(ch)) { depth--; cur += ch; continue; }
    if (ch === sep && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

/** Types that are never a request payload. */
const NON_BODY_TYPES = new Set([
  'string', 'number', 'boolean', 'unknown', 'any', 'Date', 'HttpRequest',
  'InvocationContext', 'Context', 'Now',
]);

/** One property of an inline object literal, as a schema. */
function schemaForTypeText(text) {
  const PRIMITIVES = { string: 'string', number: 'number', boolean: 'boolean' };
  return PRIMITIVES[text] ? { type: PRIMITIVES[text] } : {};
}

function parseObjectLiteral(text) {
  const body = text.trim().replace(/^\{/, '').replace(/\}$/, '');
  const properties = {};
  for (const part of splitTopLevel(body, ';')) {
    const t = part.trim();
    if (!t) continue;
    const m = t.match(/^([A-Za-z0-9_]+)(\?)?\s*:\s*([\s\S]+)$/);
    if (!m) continue;
    const [, name, optional, typeText] = m;
    properties[name] = { schema: schemaForTypeText(typeText.trim()), required: !optional };
  }
  return properties;
}

/**
 * What a service's first parameter says about the request payload. The layer is only
 * loosely typed here, so this reads the shapes that actually occur:
 *   CheckoutRequestDto                        -> named
 *   { shopId } & AcceptOrderBody              -> named (AcceptOrderBody carries the payload)
 *   { shopId; body: UpdateOrderSettingsBody } -> named (the nested body is the payload)
 *   { shopId; offline: boolean; reason?: str }-> literal
 *   Partial<RefundOrderBody>                  -> named, every field optional
 *   Record<string, unknown>                   -> permissive (the code does not say)
 *   shopId: string                            -> none (nothing to send beyond the path)
 */
function interpretRequestType(typeText) {
  if (!typeText) return { kind: 'none' };
  // Drop a parameter default: `options: { now?: Date } = {}`.
  const t = typeText.trim().split(' = ')[0].trim();
  // A top-level intersection combines the path-supplied ids with the payload; the
  // payload is whichever part actually describes fields. This has to be checked
  // before the literal branch, because `{ a: string } & Body` also starts with '{'.
  const intersection = splitTopLevel(t, '&').map((s) => s.trim()).filter(Boolean);
  if (intersection.length > 1) {
    const payload = intersection.find((p) => /Body\b/.test(p))
      || intersection.find((p) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(p) && !NON_BODY_TYPES.has(p));
    return payload ? interpretRequestType(payload) : { kind: 'permissive' };
  }
  if (t.startsWith('{')) {
    const nested = t.match(/(?:^|[\s{;])body\??\s*:\s*([^;}\n]+)/);
    if (nested) {
      // A nested body the code leaves untyped still exists as a body — just not a
      // describable one, so say that rather than claiming there is none.
      const inner = interpretRequestType(nested[1]);
      return inner.kind === 'none' ? { kind: 'permissive' } : inner;
    }
    const properties = parseObjectLiteral(t);
    // A clock seam and the raw request are not payload.
    const payloadKeys = Object.keys(properties).filter((k) => k !== 'now' && k !== 'httpRequest');
    return payloadKeys.length ? { kind: 'literal', properties } : { kind: 'none' };
  }
  const partial = t.match(/^Partial<\s*([A-Za-z_][A-Za-z0-9_]*)\s*>$/);
  if (partial) return { kind: 'named', name: partial[1], partial: true };
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)) {
    return NON_BODY_TYPES.has(t) ? { kind: 'none' } : { kind: 'named', name: t, partial: false };
  }
  return { kind: 'permissive' };
}

/** Response type and request payload, both read off the application service signature. */
function resolveContract(handlerBody) {
  // Any identifier the handler calls that names an application file — most are
  // execute*, but some (getOrderByPaymentIntent) are not. Prefer an execute* name,
  // since a handler may also call an exported helper from the same directory.
  const called = [...new Set([...handlerBody.matchAll(/\b([A-Za-z0-9_]+)\s*\(/g)].map((m) => m[1]))];
  const service =
    called.find((n) => n.startsWith('execute') && applicationIndex.has(n)) ||
    called.find((n) => applicationIndex.has(n)) ||
    null;
  if (!service) return { service: null, responseType: null, request: { kind: 'none' }, note: 'no application service call' };
  const file = applicationIndex.get(service);
  const src = fs.readFileSync(file, 'utf8');

  // Parameters and return type are matched separately: a webhook service returns its
  // own shape rather than ApplicationResult, but its request payload is still real.
  const paramMatch = src.match(new RegExp(`export\\s+(?:async\\s+)?function\\s+${service}\\s*\\(([\\s\\S]*?)\\)\\s*(?::|\\{)`, 'm'));
  const params = paramMatch ? paramMatch[1] : '';
  const retMatch = src.match(new RegExp(`export\\s+async\\s+function\\s+${service}\\s*\\([\\s\\S]*?\\)\\s*:\\s*Promise<\\s*ApplicationResult<\\s*([\\s\\S]+?)\\s*>\\s*>`, 'm'));
  const raw = retMatch ? retMatch[1].trim() : null;

  // The payload is the first parameter that describes one. Ids and the raw request
  // come first, so scanning all of them matters: executeSetPlanPricing(planId, body).
  const typeTexts = splitTopLevel(params).map((p) => (p.match(/:\s*([\s\S]+)$/) || [])[1]);
  let request = { kind: 'none' };
  for (const text of typeTexts) {
    const candidate = interpretRequestType(text);
    if (candidate.kind !== 'none') { request = candidate; break; }
  }
  // Some services take the raw request and read the JSON inside, so the signature
  // says nothing while a body is still expected. Say "a body, shape undeclared".
  if (request.kind === 'none' && /(?:httpRequest|request)\.json\(\)/.test(src)) request = { kind: 'permissive' };

  const isArray = !!raw && raw.endsWith('[]');
  return {
    service,
    requestTypeText: typeTexts.filter(Boolean).map((t) => t.trim().replace(/\s+/g, ' ')).join(' | ').slice(0, 140),
    responseType: raw ? (isArray ? raw.slice(0, -2).trim() : raw) : null,
    responseArray: isArray,
    request,
    note: raw ? null : 'no declared ApplicationResult<T>',
  };
}

// ── 1. Discover ─────────────────────────────────────────────────────────────
const rows = [];
for (const fn of discoverFunctions()) {
  const override = OVERRIDES[fn.name] || {};
  if (override.skip) continue;
  const contract = resolveContract(fn.body);
  rows.push({
    ...fn,
    ...contract,
    responseType: typeof override.response === 'string' ? override.response : contract.responseType,
    responseInline: typeof override.response === 'object' ? override.response : null,
    request: override.request === null ? { kind: 'none' } : contract.request,
  });
}

// ── 2. Locate every type we need a schema for ───────────────────────────────
const typeIndex = (() => {
  const map = new Map();
  for (const file of walk(SRC, (n) => n.endsWith('.ts'))) {
    const src = fs.readFileSync(file, 'utf8');
    // Exported or not: some DTOs (GetCatalogRequestDto) are module-local interfaces.
    for (const m of src.matchAll(/^\s*(?:export\s+)?(?:interface|type|enum)\s+([A-Za-z0-9_]+)/gm)) {
      if (!map.has(m[1])) map.set(m[1], file);
    }
  }
  return map;
})();

/**
 * Response types written inline, e.g. ApplicationResult<{ url: string }>. Four
 * services do this. Only primitive members are understood; anything richer falls
 * back to a permissive object rather than guessing.
 */
function inlineObjectToSchema(text) {
  const PRIMITIVES = { string: 'string', number: 'number', boolean: 'boolean' };
  const body = text.trim().replace(/^\{/, '').replace(/\}$/, '');
  const properties = {};
  const required = [];
  for (const part of body.split(';')) {
    const t = part.trim();
    if (!t) continue;
    const m = t.match(/^([A-Za-z0-9_]+)(\?)?\s*:\s*(.+)$/);
    if (!m) return { type: 'object', additionalProperties: true };
    const [, name, optional, typeText] = m;
    const primitive = PRIMITIVES[typeText.trim()];
    if (!primitive) return { type: 'object', additionalProperties: true };
    properties[name] = { type: primitive };
    if (!optional) required.push(name);
  }
  if (!Object.keys(properties).length) return { type: 'object', additionalProperties: true };
  return { type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) };
}

const isInlineType = (t) => /^\{/.test(t.trim());

const needed = new Set();
for (const r of rows) {
  if (r.responseType && !isInlineType(r.responseType)) needed.add(r.responseType);
  if (r.request && r.request.kind === 'named') needed.add(r.request.name);
}

// ── 3. Generate JSON Schema per type, using one generator per defining file ──
const byFile = new Map();
const missing = [];
for (const type of needed) {
  const file = typeIndex.get(type);
  if (!file) {
    missing.push(type);
    continue;
  }
  if (!byFile.has(file)) byFile.set(file, []);
  byFile.get(file).push(type);
}

const rawSchemas = {}; // type -> schema
for (const [file, types] of byFile) {
  const generator = createGenerator({
    path: file,
    tsconfig: path.join(ROOT, 'tsconfig.json'),
    type: types[0],
    expose: 'all',
    topRef: false,
    skipTypeCheck: true,
    additionalProperties: false,
    jsDoc: 'none',
  });
  for (const type of types) {
    try {
      const schema = generator.createSchema(type);
      rawSchemas[type] = schema;
    } catch (err) {
      missing.push(`${type} (${err.message.split('\n')[0].slice(0, 80)})`);
    }
  }
}

// ── 4. Flatten into components.schemas and convert draft-07 → OpenAPI 3.0 ───
//
// ts-json-schema-generator names a definition after the type expression it came
// from (Record<string,number>, Omit<Order,…>) and writes refs to it URL-encoded.
// Those are not legal OpenAPI component names, and the encoded ref does not match
// the decoded key — which is how 21 dangling refs appeared. So normalise, sanitise
// and remap every name, then rewrite refs through the map.
const normalizeName = (n) => { try { return decodeURIComponent(n); } catch { return n; } };
const sanitizeName = (n) =>
  n.replace(/[^A-Za-z0-9._-]/g, '_').replace(/_{2,}/g, '_').replace(/^_|_$/g, '') || 'Anonymous';
const shortHash = (s) => require('crypto').createHash('sha1').update(s).digest('hex').slice(0, 8);
const isPlainIdentifier = (n) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n);

/**
 * Definitions whose name is a type expression rather than a declared type
 * (Record<string,number>, Omit<Order,…>, Exclude<OrderState,…>) are an artefact of
 * the schema generator, not part of the domain vocabulary. Where the shape is small
 * enough, inline it at the point of use instead of publishing a synthetic name.
 */
const INLINE_MAX_BYTES = 1500;
const inlineDefs = new Map();

const definitionsPool = {};
for (const schema of Object.values(rawSchemas)) {
  for (const [name, def] of Object.entries(schema.definitions || {})) {
    const key = normalizeName(name);
    if (!(key in definitionsPool)) definitionsPool[key] = def;
  }
}
for (const [name, def] of Object.entries(definitionsPool)) {
  if (!isPlainIdentifier(name) && JSON.stringify(def).length <= INLINE_MAX_BYTES) inlineDefs.set(name, def);
}

const nameMap = new Map();
{
  const used = new Set();
  // A name can appear in BOTH lists (expose:'all' also puts every requested type into
  // definitions). Iterating it twice renamed the second occurrence to `_2` and then
  // overwrote the base mapping — publishing `OrderDto_2` and no `OrderDto` at all.
  // Dedupe so each original is mapped exactly once.
  for (const original of new Set([...Object.keys(definitionsPool), ...Object.keys(rawSchemas)])) {
    // A name that came from a type expression (Pick<Order,…>) is unusable as-is and
    // can run to hundreds of characters; bound it with a stable hash so generated
    // frontend type names stay sane.
    let base = sanitizeName(original);
    if (base.length > 48) base = `${base.slice(0, 40)}_${shortHash(original)}`;
    let candidate = base;
    let i = 2;
    while (used.has(candidate)) candidate = `${base}_${i++}`;
    used.add(candidate);
    nameMap.set(original, candidate);
  }
}

const unresolvedRefs = new Set();

/**
 * draft-07 → OpenAPI 3.0. The three shapes that actually differ here:
 *   type: [T, "null"]            → type: T, nullable: true
 *   anyOf: [X, { type: "null" }]  → X + nullable: true (collapsed where possible)
 *   enum: [..., null]             → nullable: true, null dropped (3.0 enums are scalar-only)
 */
function convert(node, depth = 0) {
  if (Array.isArray(node)) return node.map((x) => convert(x, depth));
  if (node === null || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === '$schema' || k === 'definitions') continue;
    if (k === '$ref' && typeof v === 'string') {
      const m = v.match(/^#\/definitions\/(.+)$/);
      if (!m) { out.$ref = v; continue; }
      const key = normalizeName(m[1]);
      if (inlineDefs.has(key) && depth < 12) {
        Object.assign(out, convert(inlineDefs.get(key), depth + 1));
        continue;
      }
      const mapped = nameMap.get(key);
      if (!mapped) unresolvedRefs.add(key);
      out.$ref = `#/components/schemas/${mapped || sanitizeName(key)}`;
      continue;
    }
    if (k === 'type' && Array.isArray(v)) {
      const nonNull = v.filter((x) => x !== 'null');
      out.type = nonNull.length === 1 ? nonNull[0] : nonNull;
      if (nonNull.length !== v.length) out.nullable = true;
      continue;
    }
    if ((k === 'anyOf' || k === 'oneOf') && Array.isArray(v)) {
      const kept = v.filter((b) => !(b && typeof b === 'object' && b.type === 'null'));
      const hadNull = kept.length !== v.length;
      const siblings = Object.keys(node).filter(
        (x) => !['anyOf', 'oneOf', 'description', 'title', 'nullable'].includes(x),
      );
      if (hadNull && kept.length === 1 && siblings.length === 0) {
        Object.assign(out, convert(kept[0], depth)); // a plain [X, null] pair
        out.nullable = true;
      } else {
        out[k] = kept.map((b) => convert(b, depth));
        if (hadNull) out.nullable = true;
      }
      continue;
    }
    if (k === 'enum' && Array.isArray(v) && v.includes(null)) {
      out.enum = v.filter((x) => x !== null);
      out.nullable = true;
      continue;
    }
    out[k] = convert(v, depth);
  }
  return out;
}

const components = {};
for (const [name, def] of Object.entries(definitionsPool)) {
  if (inlineDefs.has(name)) continue; // already inlined at every point of use
  components[nameMap.get(name)] = convert(def);
}
for (const [type, schema] of Object.entries(rawSchemas)) {
  const { definitions, ...rest } = schema; // eslint-disable-line no-unused-vars
  const target = nameMap.get(type) || sanitizeName(type);
  if (rest.type || rest.properties || rest.$ref || rest.anyOf || rest.enum || rest.additionalProperties) {
    components[target] = convert(rest);
  }
}

/** A ref to a generated schema, going through the same rename map. */
const schemaRef = (name) => `#/components/schemas/${nameMap.get(name) || sanitizeName(name)}`;

// ── 5. Build paths ──────────────────────────────────────────────────────────
const overlay = fs.existsSync(OVERLAY_FILE) ? JSON.parse(fs.readFileSync(OVERLAY_FILE, 'utf8')) : {};
const operations = overlay.operations || {};

/** The statuses mapResultToHttp can produce, so every operation documents them. */
const STD_ERRORS = {
  400: { $ref: '#/components/responses/BadRequest' },
  401: { $ref: '#/components/responses/Unauthorized' },
  403: { $ref: '#/components/responses/Forbidden' },
  404: { $ref: '#/components/responses/NotFound' },
  409: { $ref: '#/components/responses/Conflict' },
  500: { $ref: '#/components/responses/InternalError' },
};

/**
 * Every application service returns ApplicationResult<T>, and mapResultToHttp turns a
 * failure into { ok: false, code, error }. Defining the envelope and the shared status
 * responses here means the spec never carries a $ref to a response nobody defined.
 */
const ERROR_SCHEMA_NAME = 'ErrorResponse';
const CANONICAL_ERROR_RESPONSES = {
  BadRequest: { description: 'The request was rejected (validation, or the shop refused the order)', content: { 'application/json': { schema: { $ref: `#/components/schemas/${ERROR_SCHEMA_NAME}` } } } },
  Unauthorized: { description: 'Missing or invalid token', content: { 'application/json': { schema: { $ref: `#/components/schemas/${ERROR_SCHEMA_NAME}` } } } },
  Forbidden: { description: 'Authenticated but not allowed to do this', content: { 'application/json': { schema: { $ref: `#/components/schemas/${ERROR_SCHEMA_NAME}` } } } },
  NotFound: { description: 'No such resource', content: { 'application/json': { schema: { $ref: `#/components/schemas/${ERROR_SCHEMA_NAME}` } } } },
  Conflict: { description: 'The request conflicted with current state (basket, discount, slot, legal revision)', content: { 'application/json': { schema: { $ref: `#/components/schemas/${ERROR_SCHEMA_NAME}` } } } },
  InternalError: { description: 'Unexpected server error', content: { 'application/json': { schema: { $ref: `#/components/schemas/${ERROR_SCHEMA_NAME}` } } } },
};
const ERROR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'code', 'error'],
  properties: {
    ok: { type: 'boolean' },
    code: { type: 'string' },
    error: { type: 'string' },
  },
};

const tagsByPrefix = [
  ['/shops', 'Shops'], ['/products', 'Products'], ['/orders', 'Orders'],
  ['/customer-orders', 'Orders'], ['/plans', 'Plans'], ['/staff', 'Staff'],
  ['/platform', 'Platform'], ['/legal', 'Legal'], ['/reference-lists', 'ReferenceLists'],
  ['/owner', 'Reports'], ['/webhooks', 'Webhooks'],
];
function tagFor(route, meta) {
  if (meta.tags) return meta.tags;
  for (const [prefix, tag] of tagsByPrefix) if (route.startsWith(prefix)) return [tag];
  return ['Default'];
}

/**
 * How a request DTO's fields reach the service depends on the method.
 *
 * Handlers routinely do `executeX({ shopId: request.params.shopId, ...body })`, so a
 * DTO carrying shopId does not mean the client sends it — a field the path already
 * supplies is not a request field. Of what remains:
 *   - on POST/PUT/PATCH it is the JSON body;
 *   - on GET/DELETE the handler fills it from request.query, because a GET has no body.
 * Advertising a body on a GET would be a lie the generated clients would believe.
 */
const WRITE_METHODS = new Set(['post', 'put', 'patch']);

/** Follow a $ref to the schema it names (a DTO may be an alias: `type A = B`). */
function resolveSchema(node, depth = 0) {
  if (node && node.$ref && depth < 5) {
    const name = node.$ref.split('/').pop();
    const next = components[name];
    if (next && next !== node) return resolveSchema(next, depth + 1);
  }
  return node;
}

/** Fields the client must supply, from a request descriptor. */
function requestFields(request, pathParamNames) {
  if (!request) return null;
  if (request.kind === 'named') {
    const target = nameMap.get(request.name) || sanitizeName(request.name);
    const schema = resolveSchema(components[target]);
    if (!schema || !schema.properties) return null;
    const required = new Set(request.partial || !Array.isArray(schema.required) ? [] : schema.required);
    const fields = {};
    for (const [name, prop] of Object.entries(schema.properties)) {
      if (!pathParamNames.has(name)) fields[name] = { schema: prop, required: required.has(name) };
    }
    return { target, fields };
  }
  if (request.kind === 'literal') {
    const fields = {};
    for (const [name, f] of Object.entries(request.properties)) {
      // `now` is a clock seam and `httpRequest` is the raw request: never payload.
      if (!pathParamNames.has(name) && name !== 'now' && name !== 'httpRequest') fields[name] = f;
    }
    return { target: null, fields };
  }
  return null;
}

/** The JSON body for a write method, or null when there is genuinely nothing to send. */
function jsonBody(request, pathParamNames) {
  if (!request) return null;
  if (request.kind === 'permissive') return { type: 'object', additionalProperties: true };
  const resolved = requestFields(request, pathParamNames);
  if (!resolved) return null;
  const { target, fields } = resolved;
  const names = Object.keys(fields);
  if (!names.length) return null; // e.g. only path params: no body at all
  // Share the DTO whenever nothing had to be filtered out of it.
  if (target && names.length === Object.keys(components[target].properties || {}).length) {
    return { $ref: `#/components/schemas/${target}` };
  }
  const properties = {};
  const required = [];
  for (const [name, f] of Object.entries(fields)) {
    properties[name] = f.schema;
    if (f.required) required.push(name);
  }
  return { type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) };
}

/** Query parameters for a read method, from the descriptor the handler fills out of request.query. */
function queryParameters(request, pathParamNames) {
  const resolved = requestFields(request, pathParamNames);
  if (!resolved) return [];
  return Object.entries(resolved.fields).map(([name, f]) => ({ name, in: 'query', required: f.required, schema: f.schema }));
}

const paths = {};
for (const r of rows.sort((a, b) => a.route.localeCompare(b.route) || a.name.localeCompare(b.name))) {
  const route = `/${r.route}`;
  const pathParamNames = new Set([...route.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]));

  paths[route] = paths[route] || {};
  for (const method of r.methods) {
    const key = `${method.toUpperCase()} ${route}`;
    const meta = operations[key] || {};
    const pathParams = [...pathParamNames].map((name) => {
      const described = (meta.parameters || []).find((p) => p.name === name && p.description);
      return { name, in: 'path', required: true, schema: { type: 'string' }, ...(described ? { description: described.description } : {}) };
    });
    const isWrite = WRITE_METHODS.has(method.toLowerCase());
    const body = isWrite ? jsonBody(r.request, pathParamNames) : null;
    const overlayQuery = (meta.parameters || []).filter((p) => p.in !== 'path');
    const byName = new Map();
    if (!isWrite) {
      for (const q of queryParameters(r.request, pathParamNames)) byName.set(q.name, q);
    }
    for (const p of overlayQuery) byName.set(p.name, { ...(byName.get(p.name) || {}), ...p });
    const parameters = [...pathParams, ...byName.values()];

    const responses = { ...STD_ERRORS };
    responses['200'] = {
      description: meta.responseDescription || 'Success',
      content: {
        'application/json': {
          schema: r.responseInline
            ? r.responseInline
            : isInlineType(r.responseType || '')
              ? inlineObjectToSchema(r.responseType)
              : r.responseType
                ? (r.responseArray
                  ? { type: 'array', items: { $ref: schemaRef(r.responseType) } }
                  : { $ref: schemaRef(r.responseType) })
                : { type: 'object', additionalProperties: true },
        },
      },
    };

    paths[route][method.toLowerCase()] = {
      ...(meta.summary ? { summary: meta.summary } : {}),
      ...(meta.description ? { description: meta.description } : {}),
      // Keep the operationId the spec has always published: the frontends name their
      // generated hooks from it, so changing it renames hooks in three codebases.
      operationId: meta.operationId || r.name,
      tags: tagFor(r.route, meta),
      // authLevel is part of the contract: an anonymous route must say so, or a reader
      // assumes the global bearer requirement applies to it.
      ...(r.authLevel === 'anonymous' ? { security: [] } : {}),
      ...(parameters.length ? { parameters } : {}),
      ...(body ? { requestBody: { required: true, content: { 'application/json': { schema: body } } } } : {}),
      responses: { ...responses, ...(meta.responses || {}) },
    };
  }
}

// ── 6. Assemble ─────────────────────────────────────────────────────────────
const spec = {
  openapi: '3.0.0',
  info: overlay.info || {
    title: 'Restaurant Ordering System API',
    version: '1.0.0',
    description: 'REST API for managing shops and products in the Restaurant Ordering System',
  },
  servers: overlay.servers || [{ url: '/api', description: 'API base' }],
  security: overlay.security || [{ bearerAuth: [] }],
  paths,
  components: {
    securitySchemes: overlay.securitySchemes || {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    responses: { ...CANONICAL_ERROR_RESPONSES, ...(overlay.responses || {}) },
    schemas: { [ERROR_SCHEMA_NAME]: ERROR_SCHEMA, ...components },
  },
};

// ── Report / emit ───────────────────────────────────────────────────────────
const opCount = Object.values(paths).reduce((n, byMethod) => n + Object.keys(byMethod).length, 0);
console.log(`routes:            ${Object.keys(paths).length}`);
console.log(`operations:        ${opCount}`);
console.log(`schemas:           ${Object.keys(components).length}`);
console.log(`types not found:   ${missing.length}`);
if (missing.length) for (const m of missing) console.log(`   ! ${m}`);
if (unresolvedRefs.size) {
  console.log(`dangling refs:     ${unresolvedRefs.size} (a schema is referenced but was never generated)`);
  for (const r of [...unresolvedRefs].slice(0, 10)) console.log(`   ! ${r.slice(0, 90)}`);
}

if (DRY) {
  const writeNoBody = [];
  for (const [route, byMethod] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(byMethod)) {
      if (WRITE_METHODS.has(method) && !op.requestBody) writeNoBody.push(`${method.toUpperCase()} ${route}`);
    }
  }
  console.log(`\nwrite operations without a request body: ${writeNoBody.length}`);
  if (writeNoBody.length) {
    const byName = new Map(rows.map((r) => [`${r.methods[0]?.toUpperCase()} /${r.route}`, r]));
    for (const key of writeNoBody) {
      const row = byName.get(key);
      console.log(`   ${key.padEnd(56)} ${row ? `${String(row.service).padEnd(38)} kind=${row.request.kind}  type=${row.requestTypeText || '-'}` : ''}`);
    }
  }
  process.exit(0);
}
const json = JSON.stringify(spec, null, 2) + '\n';
fs.writeFileSync(OUT_FILE, json);
console.log(`written:           ${path.relative(ROOT, OUT_FILE)} (${json.length} bytes)`);
