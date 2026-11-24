'use client';

export type ApiErrorBody = {
  detail?:
    | string
    | {
        code?: string;
        message?: string;
      };
  error?: string;
};

export class FixNearApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = 'FixNearApiError';
    this.status = status;
    this.code = code;
  }
}

let csrfTokenRequest: Promise<string> | null = null;

async function getCsrfToken(): Promise<string> {
  if (!csrfTokenRequest) {
    csrfTokenRequest = fetch('/api/auth/session', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new FixNearApiError(
            response.status,
            'Could not prepare a secure request. Please refresh and try again.',
          );
        }
        const payload: unknown = await response.json();
        if (
          !payload ||
          typeof payload !== 'object' ||
          !('csrfToken' in payload) ||
          typeof payload.csrfToken !== 'string'
        ) {
          throw new FixNearApiError(503, 'Could not prepare a secure request.');
        }
        return payload.csrfToken;
      })
      .catch((error: unknown) => {
        csrfTokenRequest = null;
        throw error;
      });
  }
  return csrfTokenRequest;
}

function readError(payload: unknown, status: number): FixNearApiError {
  if (payload && typeof payload === 'object') {
    const body = payload as ApiErrorBody;
    if (typeof body.detail === 'string') {
      return new FixNearApiError(status, body.detail);
    }
    if (body.detail && typeof body.detail === 'object') {
      return new FixNearApiError(
        status,
        body.detail.message ?? body.detail.code ?? 'The request could not be completed.',
        body.detail.code ?? null,
      );
    }
    if (typeof body.error === 'string') {
      return new FixNearApiError(status, body.error, body.error);
    }
  }
  return new FixNearApiError(status, 'The request could not be completed.');
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const normalizedPath = path.replace(/^\/+/, '');
  if (
    !normalizedPath ||
    normalizedPath.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new TypeError('API paths must be non-empty relative service paths.');
  }

  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers.set('X-CSRF-Token', await getCsrfToken());
  }

  const response = await fetch(`/api/backend/v1/${normalizedPath}`, {
    ...init,
    method,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (response.status === 204) return undefined as T;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    if (!response.ok)
      throw new FixNearApiError(response.status, 'The request could not be completed.');
    throw new FixNearApiError(502, 'The API returned an unreadable response.');
  }
  if (!response.ok) throw readError(payload, response.status);
  return payload as T;
}

export function jsonRequest(method: 'POST' | 'PUT' | 'PATCH', body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}
