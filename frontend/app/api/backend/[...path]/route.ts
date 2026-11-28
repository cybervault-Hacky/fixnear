import { getEffectiveOrigin } from '../../../../host-policy.mjs';
import { timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY_BYTES = 1_000_000;
const UPSTREAM_TIMEOUT_MS = 10_000;
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
const CSRF_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function backendCookieNames() {
  const prefix = process.env.NODE_ENV === 'production' ? '__Host-fixnear-' : 'fixnear-';
  return { access: `${prefix}access`, csrf: `${prefix}csrf` };
}

function isJsonContentType(contentType: string): boolean {
  const mediaType = contentType.split(';', 1)[0].trim().toLowerCase();
  return mediaType === 'application/json' || mediaType.endsWith('+json');
}

async function readBoundedBody(
  request: Request,
): Promise<{ body: ArrayBuffer | undefined; tooLarge: boolean }> {
  const reader = request.body?.getReader();
  if (!reader) return { body: undefined, tooLarge: false };
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      await reader.cancel();
      return { body: undefined, tooLarge: true };
    }
    chunks.push(value);
  }
  if (totalBytes === 0) return { body: undefined, tooLarge: false };
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body: combined.buffer, tooLarge: false };
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ detail: { code, message } }), {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Type': 'application/json; charset=utf-8',
      Pragma: 'no-cache',
      Vary: 'Cookie',
    },
  });
}

function readCookie(request: Request, cookieName: string): string | null {
  const cookies = request.headers.get('cookie');
  if (!cookies) return null;
  for (const item of cookies.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0 || item.slice(0, separator).trim() !== cookieName) continue;
    try {
      return decodeURIComponent(item.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function hasValidCsrf(request: Request): boolean {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (!origin || fetchSite === 'cross-site') return false;
  const requestOrigin = getEffectiveOrigin(request);
  if (!requestOrigin || origin !== requestOrigin) return false;

  const csrfCookie = readCookie(request, backendCookieNames().csrf);
  const csrfHeader = request.headers.get('x-csrf-token');
  if (
    !csrfCookie ||
    !csrfHeader ||
    !CSRF_PATTERN.test(csrfCookie) ||
    !CSRF_PATTERN.test(csrfHeader)
  ) {
    return false;
  }
  const cookieBytes = Buffer.from(csrfCookie, 'utf8');
  const headerBytes = Buffer.from(csrfHeader, 'utf8');
  return cookieBytes.length === headerBytes.length && timingSafeEqual(cookieBytes, headerBytes);
}

function getBackendBaseUrl(): URL | null {
  const configured = process.env.FIXNEAR_API_BASE_URL?.trim() || process.env.BACKEND_URL?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !['', '/'].includes(url.pathname) ||
      (url.protocol !== 'https:' &&
        !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && localHost)) ||
      (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export async function proxyBackendRequest(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const method = request.method.toUpperCase();
  if (!METHODS.includes(method as (typeof METHODS)[number])) {
    return jsonError(405, 'method_not_allowed', 'This API method is not available.');
  }

  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) {
    return jsonError(
      503,
      'api_not_configured',
      'The FixNear database API is not configured for this application.',
    );
  }

  const { path } = await context.params;
  if (
    !Array.isArray(path) ||
    path.length < 2 ||
    path[0] !== 'v1' ||
    path.some((segment) => !segment || segment === '.' || segment === '..' || /[\\/]/.test(segment))
  ) {
    return jsonError(400, 'invalid_path', 'The requested API path is invalid.');
  }

  if (!['GET', 'HEAD'].includes(method) && !hasValidCsrf(request)) {
    return jsonError(403, 'forbidden', 'The request could not be verified. Refresh and try again.');
  }

  const headers = new Headers({ Accept: 'application/json' });
  const idempotencyKey = request.headers.get('idempotency-key');
  if (idempotencyKey) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        idempotencyKey,
      )
    ) {
      return jsonError(400, 'invalid_idempotency_key', 'The mutation key is invalid.');
    }
    headers.set('Idempotency-Key', idempotencyKey.toLowerCase());
  }
  const accessToken = readCookie(request, backendCookieNames().access);
  if (
    accessToken &&
    accessToken.length <= 3500 &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(accessToken)
  ) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  let body: ArrayBuffer | undefined;
  if (!['GET', 'HEAD'].includes(method)) {
    const declaredLength = request.headers.get('content-length');
    if (
      declaredLength &&
      (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY_BYTES)
    ) {
      return jsonError(413, 'request_too_large', 'The request is too large.');
    }
    const boundedBody = await readBoundedBody(request);
    if (boundedBody.tooLarge) {
      return jsonError(413, 'request_too_large', 'The request is too large.');
    }
    body = boundedBody.body;
    if (body) {
      const contentType = request.headers.get('content-type') ?? '';
      if (!isJsonContentType(contentType)) {
        return jsonError(415, 'unsupported_media_type', 'Requests must use JSON.');
      }
      headers.set('Content-Type', 'application/json');
    }
  }

  const requestUrl = new URL(request.url);
  const apiBase = new URL('/api/v1/', baseUrl);
  const upstreamUrl = new URL(path.slice(1).map(encodeURIComponent).join('/'), apiBase);
  upstreamUrl.search = requestUrl.search;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return jsonError(502, 'api_unavailable', 'The FixNear database API could not be reached.');
  }

  if (upstream.status === 204) {
    return new Response(null, {
      status: 204,
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        Pragma: 'no-cache',
        Vary: 'Cookie',
      },
    });
  }

  const contentType = upstream.headers.get('content-type') ?? '';
  if (!isJsonContentType(contentType)) {
    return jsonError(502, 'invalid_api_response', 'The API returned an unexpected response.');
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Type': contentType,
      Pragma: 'no-cache',
      Vary: 'Cookie',
    },
  });
}

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxyBackendRequest(request, context);
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
