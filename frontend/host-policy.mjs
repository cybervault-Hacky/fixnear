/** Exact public authorities only. A port in an entry must match; an omitted port
 * permits only the scheme's default port. Never accept URL paths, wildcards, or userinfo. */
export function parseAuthority(value, protocol = 'https:') {
  if (
    typeof value !== 'string' ||
    !value ||
    value !== value.trim() ||
    /[\s\\/@?#*,]/.test(value) ||
    !['http:', 'https:'].includes(protocol)
  )
    return null;
  if (!/^(?:\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::[0-9]{1,5})?$/i.test(value)) return null;
  try {
    const url = new URL(`${protocol}//${value}`);
    const rawName = value.startsWith('[')
      ? value.slice(0, value.indexOf(']') + 1)
      : value.split(':')[0];
    if (
      !rawName.startsWith('[') &&
      rawName.split('.').some((label) => !/^(?!-)[a-z0-9-]{1,63}(?<!-)$/i.test(label))
    )
      return null;
    if (url.username || url.password || url.hostname.endsWith('.')) return null;
    return url.host.toLowerCase();
  } catch {
    return null;
  }
}

export function parseAllowedHosts(raw, env) {
  if (!raw?.trim()) {
    if (env === 'production') throw new Error('FIXNEAR_ALLOWED_HOSTS is required in production');
    return null;
  }
  const entries = raw.split(',').map((entry) => entry.trim());
  if (entries.some((entry) => !entry || !parseAuthority(entry))) {
    throw new Error('FIXNEAR_ALLOWED_HOSTS must contain exact valid hosts');
  }
  return entries;
}

export function getEffectiveOrigin(request, env = process.env) {
  try {
    const fallback = new URL(request.url);
    if (fallback.username || fallback.password) return null;
    let protocol = fallback.protocol;
    let host = request.headers.get('host') || fallback.host;
    if (env.FIXNEAR_TRUST_PROXY_HEADERS === 'true') {
      const forwardedHost = request.headers.get('x-forwarded-host');
      const forwardedProto = request.headers.get('x-forwarded-proto');
      // Require a single overwritten value; never accept appended client values.
      if (forwardedHost !== null) host = forwardedHost;
      if (forwardedProto !== null) protocol = `${forwardedProto.toLowerCase()}:`;
    }
    const authority = parseAuthority(host, protocol);
    if (!authority) return null;
    const allowed = parseAllowedHosts(env.FIXNEAR_ALLOWED_HOSTS, env.NODE_ENV);
    if (allowed && !allowed.some((entry) => parseAuthority(entry, protocol) === authority))
      return null;
    return `${protocol}//${authority}`;
  } catch {
    return null;
  }
}
