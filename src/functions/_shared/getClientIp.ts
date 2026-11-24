import { HttpRequest } from '@azure/functions';

/**
 * Best-effort client IP for abuse/rate-limit purposes only — never used for
 * authorization. Azure Functions / App Service sets `x-forwarded-for` as
 * "ip1:port, ip2:port, ...", client first. Returns undefined when absent
 * (e.g. local dev with no proxy) so callers can skip rate limiting rather
 * than guess.
 */
export function getClientIp(request: HttpRequest): string | undefined {
  const header = request.headers.get('x-forwarded-for');
  if (!header) return undefined;
  const first = header.split(',')[0]?.trim();
  if (!first) return undefined;
  // Strip a trailing ":port" for IPv4 ("1.2.3.4:5678" -> "1.2.3.4"); leave
  // IPv6 (contains multiple colons, may be bracketed) untouched.
  const ipv4WithPort = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+$/;
  const match = first.match(ipv4WithPort);
  return match ? match[1] : first;
}
