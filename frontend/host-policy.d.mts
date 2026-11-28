export function parseAuthority(value: string, protocol?: string): string | null;
export function parseAllowedHosts(
  raw: string | undefined,
  env: string | undefined,
): string[] | null;
export function getEffectiveOrigin(request: Request, env?: NodeJS.ProcessEnv): string | null;
