import { FixNearApiError } from '@/lib/api/client';

export function adminErrorMessage(
  error: unknown,
  fallback = 'The admin API could not be reached.',
): string {
  if (error instanceof FixNearApiError) {
    if (error.status === 401) return 'Sign in with an active FixNear account to continue.';
    if (error.status === 403) return 'This operation requires the server-managed admin role.';
    if (error.status === 503)
      return 'The database API is not configured or is temporarily unavailable.';
    if (error.status === 404) return 'The requested record was not found.';
    return error.message;
  }
  return fallback;
}

export function isForbidden(error: unknown): boolean {
  return error instanceof FixNearApiError && (error.status === 401 || error.status === 403);
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function titleCaseSlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
