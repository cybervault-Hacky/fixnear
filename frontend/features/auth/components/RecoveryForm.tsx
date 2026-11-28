'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';

export function RecoveryForm({ mode }: { mode: 'request' | 'reset' }) {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (mode === 'reset' && (password.length < 12 || password !== confirmation)) {
      setMessage('Use at least 12 characters and make sure your passwords match.');
      return;
    }
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
      const response = await fetch(
        mode === 'request' ? '/api/auth/recover' : '/api/auth/reset-password',
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', 'x-csrf-token': data.csrfToken },
          body: JSON.stringify(
            mode === 'request'
              ? { email }
              : { email, otp, password, confirmPassword: confirmation },
          ),
        },
      );
      if (!response.ok) {
        setMessage(
          response.status === 429
            ? 'Too many attempts. Please try again later.'
            : mode === 'reset' && response.status === 400
              ? 'Check your details or request a new code. Your code may have expired.'
              : 'This service is temporarily unavailable. Please try again.',
        );
        return;
      }
      setOtp('');
      setPassword('');
      setConfirmation('');
      setSuccess(true);
    } catch {
      setMessage('This service is temporarily unavailable. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  const field =
    'mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:ring-2 focus:ring-[#588333]';
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f8f4] px-4 py-12 text-[#101827]">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl sm:p-10">
        <Link href="/" className="text-xl font-bold tracking-tight">
          Fix<span className="text-[#588333]">Near</span>
        </Link>
        <h1 className="mt-10 text-3xl font-semibold tracking-tight">
          {mode === 'request' ? 'Reset your password' : 'Choose a new password'}
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          {mode === 'request'
            ? 'Enter your email and we will send recovery instructions if an account exists.'
            : 'Enter the code sent to your email and choose a new password.'}
        </p>
        {success ? (
          <div role="status" className="mt-8 rounded-xl bg-[#ecf8e5] p-4 text-sm">
            {mode === 'request'
              ? 'If an account exists, recovery instructions will be sent.'
              : 'Your password was updated. Sign in with your new password.'}
          </div>
        ) : (
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
                className={field}
              />
            </label>
            {mode === 'reset' && (
              <>
                <label className="block text-sm font-semibold">
                  Recovery code
                  <input
                    required
                    inputMode="numeric"
                    pattern="[0-9]{6,8}"
                    maxLength={8}
                    autoComplete="one-time-code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className={field}
                  />
                </label>
                <label className="block text-sm font-semibold">
                  New password
                  <input
                    required
                    type={visible ? 'text' : 'password'}
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={field}
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Confirm password
                  <input
                    required
                    type={visible ? 'text' : 'password'}
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    className={field}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setVisible(!visible)}
                  aria-pressed={visible}
                  className="text-sm font-semibold underline"
                >
                  {visible ? 'Hide passwords' : 'Show passwords'}
                </button>
              </>
            )}
            {message && (
              <p role="alert" className="text-sm text-red-700">
                {message}
              </p>
            )}
            <button
              disabled={busy}
              className="w-full rounded-xl bg-[#101827] px-4 py-3 font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {busy
                ? 'Please wait…'
                : mode === 'request'
                  ? 'Send recovery instructions'
                  : 'Update password'}
            </button>
          </form>
        )}
        <div className="mt-7 flex flex-wrap gap-4 text-sm font-semibold">
          <Link href="/login" className="underline">
            Back to sign in
          </Link>
          {mode === 'request' && (
            <Link href="/reset-password" className="underline">
              I have a recovery code
            </Link>
          )}
          {mode === 'reset' && (
            <Link href="/forgot-password" className="underline">
              Request a new code
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
