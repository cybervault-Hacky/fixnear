'use client';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { apiRequest, jsonRequest } from '@/lib/api/client';

export function VerifyEmailForm() {
  const [email, setEmail] = useState('');
  const [fullName, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [profile, setProfile] = useState<'customer' | 'technician'>('customer');
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(sessionStorage.getItem('fixnear-signup') || 'null');
      if (stored && typeof stored === 'object') {
        if ('email' in stored && typeof stored.email === 'string') setEmail(stored.email);
        if ('fullName' in stored && typeof stored.fullName === 'string') setName(stored.fullName);
        if ('profile' in stored && stored.profile === 'technician') setProfile('technician');
      }
    } catch {
      /* User can enter details manually. */
    }
  }, []);
  async function securePost(path: string, payload: unknown): Promise<Response> {
    const session = await fetch('/api/auth/session', { cache: 'no-store' });
    if (!session.ok) throw Error();
    const data: unknown = await session.json();
    if (
      !data ||
      typeof data !== 'object' ||
      !('csrfToken' in data) ||
      typeof data.csrfToken !== 'string'
    )
      throw Error();
    return fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': data.csrfToken },
      body: JSON.stringify(payload),
    });
  }
  async function submitTechnicianApplication() {
    const saved: unknown = JSON.parse(sessionStorage.getItem('fixnear-signup') || 'null');
    if (
      !saved ||
      typeof saved !== 'object' ||
      !('application' in saved) ||
      !saved.application ||
      typeof saved.application !== 'object'
    ) {
      throw new Error('application_missing');
    }
    await apiRequest(
      'auth/provision/technician-application',
      jsonRequest('POST', saved.application),
    );
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const result = await securePost(`/api/auth/verify/${profile}`, { email, fullName, otp });
      if (!result.ok) {
        setMessage(
          result.status === 429
            ? 'Too many attempts. Try again later.'
            : result.status === 400
              ? 'The code is invalid or expired. Request a new one.'
              : 'Verification is temporarily unavailable.',
        );
        return;
      }
      const data: unknown = await result.json();
      const profileReady = Boolean(
        data && typeof data === 'object' && 'profileReady' in data && data.profileReady === true,
      );
      setVerified(true);
      setOtp('');
      if (profile === 'technician' && profileReady) {
        try {
          await submitTechnicianApplication();
          setReady(true);
          sessionStorage.removeItem('fixnear-signup');
        } catch {
          setReady(false);
          setMessage(
            'Your email is verified, but the application was not submitted. Retry or complete onboarding in your technician dashboard.',
          );
        }
      } else setReady(profileReady);
    } catch {
      setMessage('Verification is temporarily unavailable.');
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    setBusy(true);
    setMessage('');
    try {
      const result = await securePost('/api/auth/resend', { email });
      setMessage(
        result.ok
          ? 'If registration can proceed, a verification code will be sent.'
          : result.status === 429
            ? 'Too many attempts. Try again later.'
            : 'Unable to send a code right now.',
      );
    } catch {
      setMessage('Unable to send a code right now.');
    } finally {
      setBusy(false);
    }
  }
  async function retry() {
    setBusy(true);
    setMessage('');
    try {
      if (profile === 'technician') {
        await submitTechnicianApplication();
        sessionStorage.removeItem('fixnear-signup');
      } else {
        await apiRequest(
          'auth/provision/customer',
          jsonRequest('POST', { display_name: fullName }),
        );
      }
      setReady(true);
      setVerified(true);
    } catch {
      setMessage('Account setup is still unavailable. You can retry.');
    } finally {
      setBusy(false);
    }
  }
  const field =
    'mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:ring-2 focus:ring-[#588333]';
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f8f4] px-4 py-12 text-[#101827]">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl sm:p-10">
        <Link href="/" className="text-xl font-bold">
          Fix<span className="text-[#588333]">Near</span>
        </Link>
        <h1 className="mt-10 text-3xl font-semibold">Verify your email</h1>
        <p className="mt-3 text-sm text-slate-600">
          Enter the code sent to your email. Your application profile is created only after
          verification.
        </p>
        {!verified ? (
          <form onSubmit={submit} className="mt-8 space-y-5">
            <label className="block text-sm font-semibold">
              Email address
              <input
                className={field}
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block text-sm font-semibold">
              Full name
              <input
                className={field}
                required
                minLength={2}
                maxLength={120}
                autoComplete="name"
                value={fullName}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block text-sm font-semibold">
              Account type
              <select
                className={field}
                value={profile}
                onChange={(e) =>
                  setProfile(e.target.value === 'technician' ? 'technician' : 'customer')
                }
              >
                <option value="customer">Customer</option>
                <option value="technician">Technician</option>
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Verification code
              <input
                className={field}
                required
                inputMode="numeric"
                pattern="[0-9]{6,8}"
                maxLength={8}
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
            </label>
            <button
              disabled={busy}
              className="w-full rounded-xl bg-[#101827] px-4 py-3 font-semibold text-white disabled:opacity-60"
            >
              {busy ? 'Please wait…' : 'Verify email'}
            </button>
            <button
              type="button"
              disabled={busy || !email}
              onClick={resend}
              className="text-sm font-semibold underline"
            >
              Resend code
            </button>
            <button
              type="button"
              disabled={busy || fullName.trim().length < 2}
              onClick={retry}
              className="block text-sm font-semibold underline"
            >
              Already verified? Retry profile setup
            </button>
          </form>
        ) : (
          <div role="status" className="mt-8 space-y-4">
            <p>
              {ready
                ? profile === 'technician'
                  ? 'Your application is pending admin approval.'
                  : 'Your email is verified and your profile is ready.'
                : 'Your email is verified, but profile setup is temporarily unavailable.'}
            </p>
            {ready ? (
              <Link
                className="inline-block rounded-xl bg-[#101827] px-4 py-3 font-semibold text-white"
                href={profile === 'technician' ? '/technician/manage' : '/dashboard'}
              >
                {profile === 'technician' ? 'View technician dashboard' : 'Go to dashboard'}
              </Link>
            ) : (
              <button
                disabled={busy}
                onClick={retry}
                className="rounded-xl bg-[#101827] px-4 py-3 font-semibold text-white"
              >
                Retry profile setup
              </button>
            )}
          </div>
        )}
        {message && (
          <p role="status" className="mt-5 text-sm text-slate-700">
            {message}
          </p>
        )}
        <div className="mt-7">
          <Link href="/login" className="text-sm font-semibold underline">
            Back to sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
