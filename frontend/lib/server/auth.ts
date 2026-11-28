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

/** Bounded login body; never retain credentials or return provider response bodies. */
async function readLoginBody(
  request: Request,
): Promise<{ email: string; password: string } | null> {
  if (
    request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
  )
    return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 4096) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const obj = value as Record<string, unknown>;
    if (
      Object.keys(obj).some((key) => !['email', 'password'].includes(key)) ||
      typeof obj.email !== 'string' ||
      typeof obj.password !== 'string'
    )
      return null;
    const email = obj.email.trim().toLowerCase();
    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      obj.password.length < 1 ||
      obj.password.length > 128
    )
      return null;
    return { email, password: obj.password };
  } catch {
    return null;
  }
}

function loginRateGateUrl(): string | null {
  const raw = process.env.FIXNEAR_API_BASE_URL?.trim() || process.env.BACKEND_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !['', '/'].includes(url.pathname) ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && !isProduction() && loopback))
    )
      return null;
    return `${url.origin}/api/v1/auth/attempt`;
  } catch {
    return null;
  }
}

/** Password exchange remains server-side; tokens go only into existing HttpOnly cookies. */
export async function handleLogin(request: Request): Promise<Response> {
  if (!validateStateChangingRequest(request))
    return createJsonResponse({ error: 'forbidden' }, 403);
  const body = await readLoginBody(request);
  if (!body) return createJsonResponse({ error: 'invalid_request' }, 400);
  const config = getSupabaseAuthConfig();
  const gate = loginRateGateUrl();
  if (!config || !gate) return createJsonResponse({ error: 'authentication_unavailable' }, 503);
  try {
    // Next.js route handlers do not expose a trustworthy peer. The API gate charges
    // the BFF network peer, not any browser-supplied forwarded address. This is a
    // shared ceiling, not a per-user limit; an ingress limit is still necessary.
    const limit = await upstreamRequest(gate, { method: 'POST' });
    if (limit.status === 429) {
      const response = createJsonResponse({ error: 'rate_limited' }, 429);
      const retry = limit.headers.get('retry-after');
      if (retry && /^\d{1,6}$/.test(retry)) response.headers.set('Retry-After', retry);
      return response;
    }
    if (!limit.ok) return createJsonResponse({ error: 'authentication_unavailable' }, 503);
    const provider = await upstreamRequest(endpoint(config, 'token?grant_type=password'), {
      method: 'POST',
      headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if ([400, 401, 403, 422].includes(provider.status))
      return createJsonResponse({ error: 'invalid_credentials' }, 401);
    if (!provider.ok) return createJsonResponse({ error: 'authentication_unavailable' }, 503);
    const value: unknown = await provider.json();
    const tokens = readTokenResponse(value);
    const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
    const user =
      record?.user && typeof record.user === 'object'
        ? (record.user as Record<string, unknown>)
        : null;
    if (!tokens || typeof user?.email_confirmed_at !== 'string' || !user.email_confirmed_at) {
      return createJsonResponse({ error: 'invalid_credentials' }, 401);
    }
    const response = createJsonResponse({ user: tokens.user });
    setAuthCookies(response, tokens);
    return response;
  } catch {
    return createJsonResponse({ error: 'authentication_unavailable' }, 503);
  }
}

// Recovery uses Supabase email OTPs (template must show {{ .Token }}). Credentials
// and OTPs stay in bounded POST bodies; recovery tokens never enter URLs or cookies.
async function readRecoveryBody(request: Request): Promise<Record<string, unknown> | null> {
  if (
    request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
  )
    return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4096) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const obj: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return obj && typeof obj === 'object' && !Array.isArray(obj)
      ? (obj as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function recoveryEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Shared backend gate intentionally charges the BFF peer, not spoofable IP headers. */
async function recoveryRateGate(): Promise<Response | null> {
  const url = loginRateGateUrl();
  if (!url) return createJsonResponse({ error: 'authentication_unavailable' }, 503);
  try {
    const result = await upstreamRequest(url, { method: 'POST' });
    if (result.status === 429) {
      const response = createJsonResponse({ error: 'rate_limited' }, 429);
      const retry = result.headers.get('retry-after');
      if (retry && /^\d{1,6}$/.test(retry)) response.headers.set('Retry-After', retry);
      return response;
    }
    return result.ok ? null : createJsonResponse({ error: 'authentication_unavailable' }, 503);
  } catch {
    return createJsonResponse({ error: 'authentication_unavailable' }, 503);
  }
}

export async function handleRecoveryRequest(request: Request): Promise<Response> {
  if (!validateStateChangingRequest(request))
    return createJsonResponse({ error: 'forbidden' }, 403);
  const body = await readRecoveryBody(request);
  const email = recoveryEmail(body?.email);
  if (!body || Object.keys(body).some((key) => key !== 'email') || !email)
    return createJsonResponse({ error: 'invalid_request' }, 400);
  const config = getSupabaseAuthConfig();
  if (!config) return createJsonResponse({ error: 'authentication_unavailable' }, 503);
  const limited = await recoveryRateGate();
  if (limited) return limited;
  try {
    const result = await upstreamRequest(endpoint(config, 'recover'), {
      method: 'POST',
      headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    // Do not disclose whether an address exists, even if the provider distinguishes it.
    if (result.status >= 500)
      return createJsonResponse({ error: 'authentication_unavailable' }, 503);
    return createJsonResponse({
      message: 'If the account exists, recovery instructions will be sent.',
    });
  } catch {
    return createJsonResponse({ error: 'authentication_unavailable' }, 503);
  }
}

export async function handlePasswordReset(request: Request): Promise<Response> {
  if (!validateStateChangingRequest(request))
    return createJsonResponse({ error: 'forbidden' }, 403);
  const body = await readRecoveryBody(request);
  const email = recoveryEmail(body?.email);
  if (
    !body ||
    Object.keys(body).some(
      (key) => !['email', 'otp', 'password', 'confirmPassword'].includes(key),
    ) ||
    !email ||
    typeof body.otp !== 'string' ||
    !/^\d{6,8}$/.test(body.otp) ||
    typeof body.password !== 'string' ||
    body.password.length < 12 ||
    body.password.length > 128 ||
    body.password !== body.confirmPassword
  )
    return createJsonResponse({ error: 'invalid_request' }, 400);
  const config = getSupabaseAuthConfig();
  if (!config) return createJsonResponse({ error: 'authentication_unavailable' }, 503);
  const limited = await recoveryRateGate();
  if (limited) return limited;
  try {
    const verification = await upstreamRequest(endpoint(config, 'verify'), {
      method: 'POST',
      headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token: body.otp, type: 'recovery' }),
    });
    if ([400, 401, 403, 404, 422].includes(verification.status))
      return createJsonResponse({ error: 'invalid_or_expired_code' }, 400);
    if (!verification.ok) return createJsonResponse({ error: 'authentication_unavailable' }, 503);
    const tokens = readTokenResponse(await verification.json());
    if (!tokens) return createJsonResponse({ error: 'authentication_unavailable' }, 503);
    let updated: Response;
    try {
      updated = await upstreamRequest(endpoint(config, 'user'), {
        method: 'PUT',
        headers: {
          apikey: config.anonKey,
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens.accessToken}`,
        },
        body: JSON.stringify({ password: body.password }),
      });
    } finally {
      // Recovery access is never exposed to the browser. Revoke the provider session
      // even when updating fails; otherwise it expires under provider policy.
      try {
        await upstreamRequest(endpoint(config, 'logout'), {
          method: 'POST',
          headers: { apikey: config.anonKey, Authorization: `Bearer ${tokens.accessToken}` },
        });
      } catch {
        /* Best effort only. */
      }
    }
    if (!updated.ok) return createJsonResponse({ error: 'authentication_unavailable' }, 503);
    const response = createJsonResponse({
      message: 'Password updated. Sign in with your new password.',
    });
    clearAuthCookies(response);
    return response;
  } catch {
    return createJsonResponse({ error: 'authentication_unavailable' }, 503);
  }
}

/** Public registration accepts only the fixed route's profile type, never a role field. */
export async function handleSignup(request: Request): Promise<Response> {
  if (!validateStateChangingRequest(request))
    return createJsonResponse({ error: 'forbidden' }, 403);
  const body = await readRecoveryBody(request);
  const email = recoveryEmail(body?.email);
  if (
    !body ||
    Object.keys(body).some(
      (key) => !['email', 'password', 'confirmPassword', 'fullName', 'acceptedTerms'].includes(key),
    ) ||
    !email ||
    typeof body.fullName !== 'string' ||
    body.fullName.trim().length < 2 ||
    body.fullName.trim().length > 120 ||
    typeof body.password !== 'string' ||
    body.password.length < 12 ||
    body.password.length > 128 ||
    body.password !== body.confirmPassword ||
    body.acceptedTerms !== true
  ) {
    return createJsonResponse({ error: 'invalid_request' }, 400);
  }
  const config = getSupabaseAuthConfig();
  if (!config) return createJsonResponse({ error: 'authentication_unavailable' }, 503);
  const limited = await recoveryRateGate();
  if (limited) return limited;
  try {
    const result = await upstreamRequest(endpoint(config, 'signup'), {
      method: 'POST',
      headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: body.password }),
    });
    if (result.status >= 500)
      return createJsonResponse({ error: 'authentication_unavailable' }, 503);
    // Provider responses for duplicate addresses must not disclose account existence.
    return createJsonResponse({
      message: 'If registration can proceed, a verification code will be sent.',
    });
  } catch {
    return createJsonResponse({ error: 'authentication_unavailable' }, 503);
  }
}

export async function handleSignupResend(request: Request): Promise<Response> {
  if (!validateStateChangingRequest(request))
    return createJsonResponse({ error: 'forbidden' }, 403);
  const body = await readRecoveryBody(request);
  const email = recoveryEmail(body?.email);
  if (!body || Object.keys(body).some((key) => key !== 'email') || !email)
    return createJsonResponse({ error: 'invalid_request' }, 400);
  const config = getSupabaseAuthConfig();
  if (!config) return createJsonResponse({ error: 'authentication_unavailable' }, 503);
  const limited = await recoveryRateGate();
  if (limited) return limited;
  try {
    const result = await upstreamRequest(endpoint(config, 'resend'), {
      method: 'POST',
      headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, type: 'signup' }),
    });
    if (result.status >= 500)
      return createJsonResponse({ error: 'authentication_unavailable' }, 503);
    return createJsonResponse({
      message: 'If registration can proceed, a verification code will be sent.',
    });
  } catch {
    return createJsonResponse({ error: 'authentication_unavailable' }, 503);
  }
}

/** OTP is submitted by POST only; fixed customer/technician route selects provision endpoint. */
export async function handleSignupVerification(
  request: Request,
  profile: 'customer' | 'technician',
): Promise<Response> {
  if (!validateStateChangingRequest(request))
    return createJsonResponse({ error: 'forbidden' }, 403);
  const body = await readRecoveryBody(request);
  const email = recoveryEmail(body?.email);
  if (
    !body ||
    Object.keys(body).some((key) => !['email', 'otp', 'fullName'].includes(key)) ||
    !email ||
    typeof body.otp !== 'string' ||
    !/^\d{6,8}$/.test(body.otp) ||
    typeof body.fullName !== 'string' ||
    body.fullName.trim().length < 2 ||
    body.fullName.trim().length > 120
  )
    return createJsonResponse({ error: 'invalid_request' }, 400);
  const config = getSupabaseAuthConfig();
  const gate = loginRateGateUrl();
  if (!config || !gate) return createJsonResponse({ error: 'authentication_unavailable' }, 503);
  const limited = await recoveryRateGate();
  if (limited) return limited;
  try {
    const verified = await upstreamRequest(endpoint(config, 'verify'), {
      method: 'POST',
      headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token: body.otp, type: 'signup' }),
    });
    if ([400, 401, 403, 404, 422].includes(verified.status))
      return createJsonResponse({ error: 'invalid_or_expired_code' }, 400);
    if (!verified.ok) return createJsonResponse({ error: 'authentication_unavailable' }, 503);
    const raw: unknown = await verified.json();
    const tokens = readTokenResponse(raw);
    const user =
      raw && typeof raw === 'object' && 'user' in raw && raw.user && typeof raw.user === 'object'
        ? (raw.user as Record<string, unknown>)
        : null;
    if (
      !tokens ||
      typeof user?.email_confirmed_at !== 'string' ||
      !user.email_confirmed_at ||
      tokens.user.email?.trim().toLowerCase() !== email
    )
      return createJsonResponse({ error: 'invalid_or_expired_code' }, 400);
    let profileReady = false;
    try {
      // The backend verifies the access token independently and picks the fixed role.
      const provision = await upstreamRequest(
        gate.replace(/\/auth\/attempt$/, `/auth/provision/${profile}`),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokens.accessToken}`,
          },
          body: JSON.stringify({ display_name: body.fullName.trim() }),
        },
      );
      profileReady = provision.ok;
    } catch {
      /* Session permits an idempotent retry without resending the OTP. */
    }
    const response = createJsonResponse({ user: tokens.user, profileReady });
    setAuthCookies(response, tokens);
    return response;
  } catch {
    return createJsonResponse({ error: 'authentication_unavailable' }, 503);
  }
}
