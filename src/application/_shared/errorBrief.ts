const MAX_CHARS = 240;

/**
 * One short, single-line description of a caught value for a log line: `Name[code]: message`.
 * Never includes a stack, and is capped so a huge upstream message cannot flood the logs.
 * Use it where a catch used to log only an id, so the cause is no longer lost.
 */
export function errorBrief(err: unknown): string {
  if (err === null || err === undefined) return 'unknown error';
  let text: string;
  if (typeof err === 'object') {
    const e = err as { name?: unknown; type?: unknown; code?: unknown; message?: unknown };
    const name = typeof e.type === 'string' ? e.type : typeof e.name === 'string' ? e.name : 'Error';
    const code = typeof e.code === 'string' || typeof e.code === 'number' ? `[${e.code}]` : '';
    const message = typeof e.message === 'string' ? e.message : '';
    text = `${name}${code}${message ? `: ${message}` : ''}`;
  } else {
    text = String(err);
  }
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > MAX_CHARS ? `${oneLine.slice(0, MAX_CHARS)}…` : oneLine;
}
