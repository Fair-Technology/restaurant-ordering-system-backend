export interface ErrorCodeEntry {
  errorCode: string;
  field?: string;
}

/**
 * The stable errorCode (and field) for a domain validation message. Domain validators return plain
 * message strings; the codes are keyed by those exact constants. A message built at run time
 * (e.g. "Unknown allergen: x") is not in the table and takes the fallback.
 */
export function codedFields(
  message: string,
  table: Readonly<Record<string, ErrorCodeEntry>>,
  fallback: ErrorCodeEntry,
): ErrorCodeEntry {
  return table[message] ?? fallback;
}
