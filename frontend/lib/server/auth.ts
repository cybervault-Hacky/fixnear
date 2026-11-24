import { randomBytes, timingSafeEqual } from 'node:crypto';

export interface AuthUser {
  id: string;
  email: string | null;
}

interface SupabaseAuthConfig {
  authUrl: string;
  anonKey: string;
}

interface CsrfState {
  token: string;
  needsCookie: boolean;
}

interface SupabaseTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

const ACCESS_COOKIE_AGE_CAP_SECONDS = 60 * 60;
const REFRESH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const CSRF_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12;
const MAX_COOKIE_TOKEN_LENGTH = 3500;
const UPSTREAM_TIMEOUT_MS = 5000;
const CSRF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function getAuthCookieNames() {
  const prefix = process.env.NODE_ENV === 'production' ? '__Host-fixnear-' : 'fixnear-';
  return {
    access: `${prefix}access`,
    refresh: `${prefix}refresh`,
    csrf: `${prefix}csrf`,
  } as const;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  for (const item of cookieHeader.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0 || item.slice(0, separator).trim() !== name) continue;

    try {
      return decodeURIComponent(item.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }

  return null;
}

interface CookieOptions {
  httpOnly: boolean;
  sameSite: 'Lax' | 'Strict';
  maxAge: number;
  expires?: Date;
}

function appendCookie(
  response: Response,
  name: string,
  value: string,
  options: CookieOptions,
): void {
  const attributes = [
    `Path=/`,
    `Max-Age=${Math.max(0, Math.floor(options.maxAge))}`,
    `SameSite=${options.sameSite}`,
  ];
  if (options.httpOnly) attributes.push('HttpOnly');
  if (isProduction()) attributes.push('Secure');
  if (options.expires) attributes.push(`Expires=${options.expires.toUTCString()}`);

  response.headers.append(
    'Set-Cookie',
    `${name}=${encodeURIComponent(value)}; ${attributes.join('; ')}`,
  );
}

function createJsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Type': 'application/json; charset=utf-8',
      Pragma: 'no-cache',
      Vary: 'Cookie',
    },
  });
}

function getCsrfState(request: Request): CsrfState {
  const csrfCookie = readCookie(request, getAuthCookieNames().csrf);
  if (csrfCookie && CSRF_TOKEN_PATTERN.test(csrfCookie)) {
    return { token: csrfCookie, needsCookie: false };
  }
  return { token: randomBytes(32).toString('base64url'), needsCookie: true };
}

function createSessionResponse(
  request: Request,
  csrf: CsrfState,
  user: AuthUser | null,
  status = 200,
  error?: 'authentication_unavailable',
): Response {
  const body: Record<string, unknown> = { user, csrfToken: csrf.token };
  if (error) body.error = error;

  const response = createJsonResponse(body, status);
  if (csrf.needsCookie) {
    appendCookie(response, getAuthCookieNames().csrf, csrf.token, {
      httpOnly: true,
      sameSite: 'Strict',
      maxAge: CSRF_COOKIE_MAX_AGE_SECONDS,
    });
  }
  return response;
}

function readAuthToken(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_COOKIE_TOKEN_LENGTH
    ? value
    : null;
}

function readAuthUser(value: unknown): AuthUser | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || record.id.length === 0 || record.id.length > 256) {
    return null;
  }

  return {
    id: record.id,
    email: typeof record.email === 'string' ? record.email : null,
  };
}

function readTokenResponse(value: unknown): SupabaseTokenResponse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const accessToken = readAuthToken(record.access_token);
  const refreshToken = readAuthToken(record.refresh_token);
  const expiresIn = record.expires_in;
  const user = readAuthUser(record.user);

  if (
    !accessToken ||
    !refreshToken ||
    typeof expiresIn !== 'number' ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0 ||
    !user
  ) {
    return null;
  }

  return { accessToken, refreshToken, expiresIn, user };
}

function getSupabaseAuthConfig(): SupabaseAuthConfig | null {
  const rawUrl = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (!rawUrl || !anonKey) return null;

  try {
    const url = new URL(rawUrl);
    const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && !isProduction() && isLoopback)) ||
      (isProduction() && url.protocol !== 'https:')
    ) {
      return null;
    }

    const path = url.pathname.replace(/\/+$/, '');
    const authPath = path.endsWith('/auth/v1') ? path : `${path}/auth/v1`;
    return { authUrl: `${url.origin}${authPath}`, anonKey };
  } catch {
    return null;
  }
}

function endpoint(config: SupabaseAuthConfig, route: string): string {
  return `${config.authUrl}/${route}`;
}

function upstreamRequest(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
}

function setAuthCookies(response: Response, tokens: SupabaseTokenResponse): void {
  const names = getAuthCookieNames();
  const accessMaxAge = Math.max(
    1,
    Math.min(Math.floor(tokens.expiresIn), ACCESS_COOKIE_AGE_CAP_SECONDS),
  );

  appendCookie(response, names.access, tokens.accessToken, {
    httpOnly: true,
    sameSite: 'Strict',
    maxAge: accessMaxAge,
  });
  appendCookie(response, names.refresh, tokens.refreshToken, {
    httpOnly: true,
    sameSite: 'Strict',
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  });
}

function clearAuthCookies(response: Response, includeCsrf = false): void {
  const names = getAuthCookieNames();
  const cookieNames = includeCsrf
    ? [names.access, names.refresh, names.csrf]
    : [names.access, names.refresh];

  for (const name of cookieNames) {
    appendCookie(response, name, '', {
      httpOnly: true,
      sameSite: 'Strict',
      maxAge: 0,
      expires: new Date(0),
    });
  }
}

function validateOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const configuredFrontend = process.env.FRONTEND_URL?.trim();
  if (!origin || !configuredFrontend) return false;

  try {
    const expected = new URL(configuredFrontend);
    const actual = new URL(origin);
    if (isProduction() && (expected.protocol !== 'https:' || actual.protocol !== 'https:')) {
      return false;
    }
    if (actual.origin !== origin || expected.origin !== actual.origin) return false;
  } catch {
    return false;
  }

  return request.headers.get('sec-fetch-site') !== 'cross-site';
}

function validateCsrfToken(request: Request): boolean {
  const csrfCookie = readCookie(request, getAuthCookieNames().csrf);
  const csrfHeader = request.headers.get('x-csrf-token');
  if (
    !csrfCookie ||
    !csrfHeader ||
    !CSRF_TOKEN_PATTERN.test(csrfCookie) ||
    !CSRF_TOKEN_PATTERN.test(csrfHeader)
  ) {
    return false;
  }

  const cookieBytes = Buffer.from(csrfCookie, 'utf8');
  const headerBytes = Buffer.from(csrfHeader, 'utf8');
  return cookieBytes.length === headerBytes.length && timingSafeEqual(cookieBytes, headerBytes);
}

export function validateStateChangingRequest(request: Request): boolean {
  return validateOrigin(request) && validateCsrfToken(request);
}

export async function handleSession(request: Request): Promise<Response> {
  const csrf = getCsrfState(request);
  const names = getAuthCookieNames();
  const accessToken = readAuthToken(readCookie(request, names.access));
  const refreshToken = readAuthToken(readCookie(request, names.refresh));

  if (!accessToken && !refreshToken) {
    return createSessionResponse(request, csrf, null);
  }

  const config = getSupabaseAuthConfig();
  if (!config) {
    return createSessionResponse(request, csrf, null, 503, 'authentication_unavailable');
  }

  if (accessToken) {
    let userResponse: Response;
    try {
      userResponse = await upstreamRequest(endpoint(config, 'user'), {
        method: 'GET',
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch {
      return createSessionResponse(request, csrf, null, 503, 'authentication_unavailable');
    }

    if (userResponse.ok) {
      let user: AuthUser | null = null;
      try {
        user = readAuthUser(await userResponse.json());
      } catch {
        // Treat malformed upstream data as unavailable; do not expose it to the browser.
      }
      if (!user) {
        return createSessionResponse(request, csrf, null, 503, 'authentication_unavailable');
      }
      return createSessionResponse(request, csrf, user);
    }

    if (userResponse.status !== 401) {
      return createSessionResponse(request, csrf, null, 503, 'authentication_unavailable');
    }
  }

  if (!refreshToken) {
    const response = createSessionResponse(request, csrf, null);
    clearAuthCookies(response);
    return response;
  }

  let refreshResponse: Response;
  try {
    refreshResponse = await upstreamRequest(endpoint(config, 'token?grant_type=refresh_token'), {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    return createSessionResponse(request, csrf, null, 503, 'authentication_unavailable');
  }

  if ([400, 401, 403].includes(refreshResponse.status)) {
    const response = createSessionResponse(request, csrf, null);
    clearAuthCookies(response);
    return response;
  }
  if (!refreshResponse.ok) {
    return createSessionResponse(request, csrf, null, 503, 'authentication_unavailable');
  }

  let refreshedTokens: SupabaseTokenResponse | null = null;
  try {
    refreshedTokens = readTokenResponse(await refreshResponse.json());
  } catch {
    // Do not reveal or log details returned by the identity provider.
  }
  if (!refreshedTokens) {
    const response = createSessionResponse(request, csrf, null);
    clearAuthCookies(response);
    return response;
  }

  const response = createSessionResponse(request, csrf, refreshedTokens.user);
  setAuthCookies(response, refreshedTokens);
  return response;
}

export async function handleLogout(request: Request): Promise<Response> {
  if (!validateStateChangingRequest(request)) {
    return createJsonResponse({ error: 'forbidden' }, 403);
  }

  const accessToken = readAuthToken(readCookie(request, getAuthCookieNames().access));
  const config = getSupabaseAuthConfig();
  if (accessToken && config) {
    try {
      await upstreamRequest(endpoint(config, 'logout'), {
        method: 'POST',
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch {
      // Local logout still clears browser cookies when the provider is unavailable.
    }
  }

  const response = new Response(null, {
    status: 204,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      Vary: 'Cookie',
    },
  });
  clearAuthCookies(response, true);
  return response;
}
