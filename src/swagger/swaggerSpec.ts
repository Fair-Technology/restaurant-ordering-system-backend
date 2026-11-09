/**
 * The API specification.
 *
 * Generated from the code by `scripts/generate-openapi.js` (run automatically before
 * every build, and by `npm run openapi:generate`). Do not hand-edit swagger.json:
 * the generator reads the route registrations and the application services, so the
 * published spec cannot drift from the routes that actually exist. Human-readable
 * prose lives in `src/swagger/overlay.json`, keyed by "<METHOD> <path>".
 *
 * Typed loosely on purpose: this is a large data document, and the tests inspect it
 * structurally.
 */
import generated from './swagger.json';

export const swaggerSpec: any = generated;
