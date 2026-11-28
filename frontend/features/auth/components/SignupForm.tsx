'use client';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

export function SignupForm({ technician = false }: { technician?: boolean }) {
  const [fullName, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [acceptedTerms, setTerms] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [phone, setPhone] = useState('');
  const [description, setDescription] = useState('');
  const [years, setYears] = useState('');
  const [area, setArea] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pin, setPin] = useState('');
  const [services, setServices] = useState<{ slug: string; title: string }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    if (!technician) return;
    fetch('/api/backend/v1/services', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((value: unknown) => {
        if (Array.isArray(value))
          setServices(
            value.filter(
              (item): item is { slug: string; title: string } =>
                item && typeof item.slug === 'string' && typeof item.title === 'string',
            ),
          );
      })
      .catch(() => setServices([]));
  }, [technician]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (password.length < 12 || password !== confirmPassword || !acceptedTerms) {
      setError(
        'Use at least 12 characters, confirm your password, and accept the terms and privacy policy.',
      );
      return;
    }
    if (
      technician &&
      (!/^\+[1-9][0-9]{7,14}$/.test(phone) ||
        !/^[1-9][0-9]{5}$/.test(pin) ||
        !selected.length ||
        !area.trim() ||
        !city.trim() ||
        !state.trim() ||
        description.trim().length < 30 ||
        years === '' ||
        Number(years) < 0 ||
        Number(years) > 60 ||
        !Number.isInteger(Number(years)))
    ) {
      setError(
        'Complete your professional details, choose a service, and enter a valid phone and PIN.',
      );
      return;
    }
    setBusy(true);
    try {
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
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': data.csrfToken },
        body: JSON.stringify({ fullName, email, password, confirmPassword, acceptedTerms }),
      });
      if (!response.ok) {
        setError(
          response.status === 429
            ? 'Too many attempts. Please try again later.'
            : 'Registration is unavailable. Check your details and try again.',
        );
        return;
      }
      sessionStorage.setItem(
        'fixnear-signup',
        JSON.stringify({
          fullName,
          email,
          profile: technician ? 'technician' : 'customer',
          ...(technician
            ? {
                application: {
                  display_name: fullName,
                  phone_e164: phone,
                  professional_description: description,
                  years_experience: Number(years),
                  service_slugs: selected,
                  area_name: area,
                  city,
                  state,
                  postal_code: pin,
                },
              }
            : {}),
        }),
      );
      setPassword('');
      setConfirm('');
      setSuccess(true);
    } catch {
      setError('Registration is temporarily unavailable. Please try again.');
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
        <h1 className="mt-10 text-3xl font-semibold">
          {technician ? 'Join as a technician' : 'Create your account'}
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          {technician
            ? 'Enter your professional details and verify your email to submit for admin review.'
            : 'A trusted place to manage your home services.'}
        </p>
        {success ? (
          <div className="mt-8 space-y-4" role="status">
            <p>If registration can proceed, a verification code will be sent. Check your email.</p>
            <Link
              href="/verify-email"
              className="inline-block rounded-xl bg-[#101827] px-4 py-3 font-semibold text-white"
            >
              Verify your email
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-5">
            <label className="block text-sm font-semibold">
              Full name
              <input
                className={field}
                autoComplete="name"
                required
                minLength={2}
                maxLength={120}
                value={fullName}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block text-sm font-semibold">
              Email address
              <input
                className={field}
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block text-sm font-semibold">
              Password
              <input
                className={field}
                type={visible ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="block text-sm font-semibold">
              Confirm password
              <input
                className={field}
                type={visible ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                value={confirmPassword}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            {technician && (
              <fieldset className="space-y-4">
                <legend className="text-lg font-semibold">Professional details</legend>
                <label className="block text-sm font-semibold">
                  Phone in international format
                  <input
                    required
                    type="tel"
                    autoComplete="tel"
                    placeholder="+919876543210"
                    pattern="\+[1-9][0-9]{7,14}"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={field}
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Professional experience
                  <textarea
                    required
                    minLength={30}
                    maxLength={2000}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className={field}
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Years of experience
                  <input
                    required
                    type="number"
                    min={0}
                    max={60}
                    value={years}
                    onChange={(e) => setYears(e.target.value)}
                    className={field}
                  />
                </label>
                <fieldset>
                  <legend className="text-sm font-semibold">Services you provide</legend>
                  {services.length === 0 && (
                    <p className="text-sm text-red-700">
                      Services unavailable; please try again later.
                    </p>
                  )}
                  {services.map((item) => (
                    <label key={item.slug} className="mt-2 flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selected.includes(item.slug)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, item.slug]
                              : selected.filter((slug) => slug !== item.slug),
                          )
                        }
                      />
                      {item.title}
                    </label>
                  ))}
                </fieldset>
                <label className="block text-sm font-semibold">
                  Service area
                  <input
                    required
                    maxLength={120}
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    className={field}
                  />
                </label>
                <label className="block text-sm font-semibold">
                  City
                  <input
                    required
                    maxLength={120}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className={field}
                  />
                </label>
                <label className="block text-sm font-semibold">
                  State
                  <input
                    required
                    maxLength={120}
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className={field}
                  />
                </label>
                <label className="block text-sm font-semibold">
                  PIN code
                  <input
                    required
                    inputMode="numeric"
                    pattern="[1-9][0-9]{5}"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    className={field}
                  />
                </label>
              </fieldset>
            )}
            <button
              type="button"
              aria-pressed={visible}
              onClick={() => setVisible(!visible)}
              className="text-sm font-semibold underline"
            >
              {visible ? 'Hide passwords' : 'Show passwords'}
            </button>
            <label className="flex gap-3 text-sm">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setTerms(e.target.checked)}
                required
              />{' '}
              I accept the terms and privacy policy.
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              disabled={busy}
              className="w-full rounded-xl bg-[#101827] px-4 py-3 font-semibold text-white disabled:opacity-60"
            >
              {busy ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        )}
        <div className="mt-7 flex flex-wrap gap-4 text-sm font-semibold">
          <Link href="/login" className="underline">
            Sign in
          </Link>
          <Link href={technician ? '/signup' : '/signup/technician'} className="underline">
            {technician ? 'Customer signup' : 'Technician signup'}
          </Link>
        </div>
      </section>
    </main>
  );
}
