'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const session = await fetch('/api/auth/session', { cache: 'no-store' });
      if (!session.ok) throw new Error('unavailable');
      const data: unknown = await session.json();
      if (
        !data ||
        typeof data !== 'object' ||
        !('csrfToken' in data) ||
        typeof data.csrfToken !== 'string'
      )
        throw new Error('unavailable');
      const result = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': data.csrfToken },
        body: JSON.stringify({ email, password }),
      });
      if (!result.ok) {
        setError(
          result.status === 401
            ? 'Check your credentials and verify your email, then try again.'
            : result.status === 429
              ? 'Too many attempts. Please try again later.'
              : 'Sign in is temporarily unavailable. Please try again.',
        );
        return;
      }
      // Server-managed roles decide navigation. No role from the identity provider is trusted.
      const account = await fetch('/api/backend/v1/auth/me', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!account.ok) {
        setError(
          'Signed in, but your application account is not provisioned yet. Open Verify email to retry profile setup.',
        );
        return;
      }
      const details: unknown = await account.json();
      const roles =
        details &&
        typeof details === 'object' &&
        'role_codes' in details &&
        Array.isArray(details.role_codes)
          ? details.role_codes
          : [];
      window.location.assign(
        roles.includes('admin')
          ? '/admin'
          : roles.includes('technician')
            ? '/technician/manage'
            : '/dashboard',
      );
    } catch {
      setError('Sign in is temporarily unavailable. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f8f4] px-4 py-12 text-[#101827]">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl sm:p-10">
        <Link href="/" className="text-xl font-bold tracking-tight">
          Fix<span className="text-[#588333]">Near</span>
        </Link>
        <p className="mt-10 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Welcome back
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Sign in to your account</h1>
        <p className="mt-3 text-sm text-slate-600">Your home services, securely in one place.</p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <label className="block text-sm font-semibold">
            Email address
            <input
              required
              type="email"
              autoComplete="email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:ring-2 focus:ring-[#588333]"
            />
          </label>
          <label className="block text-sm font-semibold">
            Password
            <span className="relative mt-2 block">
              <input
                required
                type={visible ? 'text' : 'password'}
                autoComplete="current-password"
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 pr-20 font-normal outline-none focus:ring-2 focus:ring-[#588333]"
              />
              <button
                type="button"
                onClick={() => setVisible(!visible)}
                aria-label={visible ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-4 text-sm font-semibold text-slate-600"
              >
                {visible ? 'Hide' : 'Show'}
              </button>
            </span>
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            disabled={busy}
            className="w-full rounded-xl bg-[#101827] px-4 py-3 font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <Link href="/forgot-password" className="mt-5 inline-block text-sm font-semibold underline">
          Forgot password?
        </Link>
        <Link href="/verify-email" className="mt-4 inline-block text-sm font-semibold underline">
          Verify email or finish account setup
        </Link>
        <div className="mt-4 flex gap-4 text-sm font-semibold">
          <Link href="/signup" className="underline">
            Create account
          </Link>
          <Link href="/signup/technician" className="underline">
            Join as a technician
          </Link>
        </div>
        <p className="mt-7 text-sm text-slate-600">
          Need help accessing an existing account? Contact FixNear support.
        </p>
      </section>
    </main>
  );
}
