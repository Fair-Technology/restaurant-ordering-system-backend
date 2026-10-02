import { HttpRequest } from '@azure/functions';

/**
 * Reads a JSON object body. Returns null when the body is not a JSON object.
 * With `emptyAllowed`, a missing body counts as `{}` (for actions whose body is all optional).
 */
export async function readJsonObject(
  request: HttpRequest,
  options: { emptyAllowed?: boolean } = {},
): Promise<Record<string, unknown> | null> {
  const text = await request.text().catch(() => '');
  if (text.trim() === '') return options.emptyAllowed ? {} : null;
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
