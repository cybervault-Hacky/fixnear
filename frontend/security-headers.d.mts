export interface SecurityHeader {
  key: string;
  value: string;
}

export declare function buildContentSecurityPolicy(
  env: string | undefined,
  mapTilesEnabled?: boolean,
): string;
export declare function buildSecurityHeaders(
  env: string | undefined,
  mapTilesEnabled?: boolean,
): SecurityHeader[];
declare const buildSecurityHeadersDefault: typeof buildSecurityHeaders;
export default buildSecurityHeadersDefault;
