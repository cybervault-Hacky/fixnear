import { handleSignupVerification } from '../../../../../lib/server/auth';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export function POST(request: Request) {
  return handleSignupVerification(request, 'customer');
}
