import { NextResponse, type NextRequest } from 'next/server';
import { getEffectiveOrigin } from './host-policy.mjs';

// The infrastructure must prevent direct access when proxy headers are trusted.
export function proxy(request: NextRequest) {
  if (!getEffectiveOrigin(request)) {
    return new NextResponse('Invalid host', { status: 400 });
  }
  return NextResponse.next();
}

export const config = { matcher: '/:path*' };
