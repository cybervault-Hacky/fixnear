'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MapPin, ShieldCheck, Wrench } from 'lucide-react';

import { Footer } from '@/components/layout/Footer';
import { Navbar } from '@/components/navigation/Navbar';
import { Container } from '@/components/layout/Container';
import { FixNearApiError } from '@/lib/api/client';
import {
  getPublicTechnicianServiceProfile,
  type PublicTechnicianServiceProfile,
} from '@/lib/api/technician-discovery';

type PublicTechnicianServiceProfilePageProps = {
  technicianId: string;
  serviceSlug: string;
};

export function PublicTechnicianServiceProfilePage({
  technicianId,
  serviceSlug,
}: PublicTechnicianServiceProfilePageProps) {
  const [profile, setProfile] = useState<PublicTechnicianServiceProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void getPublicTechnicianServiceProfile(technicianId, serviceSlug)
      .then((result) => {
        if (active) setProfile(result);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setProfile(null);
        setError(
          cause instanceof FixNearApiError && cause.status === 404
            ? 'This professional does not have a currently eligible public profile for the selected service.'
            : 'The service profile could not be loaded. Please try again later.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [serviceSlug, technicianId]);

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Navbar />
      <main id="main-content" className="min-h-[65vh] bg-[#f8faf7] py-10 sm:py-16">
        <Container>
          <Link
            href={`/services/${encodeURIComponent(serviceSlug)}#nearby-technicians`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-midnight/75 underline decoration-midnight/25 underline-offset-4 hover:text-midnight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
          >
            <ArrowLeft aria-hidden="true" size={16} /> Back to service-area results
          </Link>

          {loading ? (
            <div
              role="status"
              className="mt-6 rounded-2xl border border-midnight/10 bg-white p-6 text-sm text-midnight/65"
            >
              Loading public service profile…
            </div>
          ) : error ? (
            <div className="mt-6 rounded-2xl border border-midnight/10 bg-white p-6">
              <h1 className="text-xl font-semibold text-midnight">Service profile unavailable</h1>
              <p role="alert" className="mt-2 text-sm leading-6 text-midnight/65">
                {error}
              </p>
            </div>
          ) : profile ? (
            <article className="mt-6 max-w-3xl rounded-3xl border border-midnight/10 bg-white p-5 shadow-[0_18px_50px_rgba(16,24,39,0.06)] sm:p-8">
              <p className="inline-flex items-center gap-2 rounded-full bg-[#eef7e5] px-3 py-1.5 text-xs font-semibold text-midnight/75">
                <ShieldCheck aria-hidden="true" size={14} /> Approved verification
              </p>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-midnight sm:text-4xl">
                {profile.display_name}
              </h1>
              <p className="mt-2 text-sm font-medium text-midnight/60">
                {profile.service_title}
                {profile.years_experience !== null
                  ? ` · ${profile.years_experience} years' experience`
                  : ''}
              </p>
              <div className="mt-6 flex items-start gap-3 rounded-2xl bg-[#f8faf7] p-4">
                <Wrench aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-midnight/55" />
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-midnight/75">
                  {profile.professional_description}
                </p>
              </div>

              <section aria-labelledby="profile-coverage-title" className="mt-6">
                <h2 id="profile-coverage-title" className="text-sm font-semibold text-midnight">
                  Service coverage areas
                </h2>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {profile.coverage_areas.map((area) => (
                    <li
                      key={`${area.area_name}|${area.city}|${area.postal_code}`}
                      className="flex items-start gap-2 rounded-xl border border-midnight/10 p-3 text-sm leading-5 text-midnight/70"
                    >
                      <MapPin
                        aria-hidden="true"
                        size={16}
                        className="mt-0.5 shrink-0 text-midnight/45"
                      />
                      <span>
                        {area.area_name}, {area.city}, {area.state}
                        {area.postal_code ? ` · ${area.postal_code}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <p className="mt-6 border-t border-midnight/8 pt-4 text-xs leading-5 text-midnight/55">
                {profile.note} This page does not show a home address, contact details, live
                location, availability, ETA or a confirmed appointment.
              </p>
              <Link
                href={`/bookings/new?service=${encodeURIComponent(serviceSlug)}`}
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-midnight px-4 text-sm font-semibold text-white hover:bg-[#1d2a3f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
              >
                Request this service
              </Link>
            </article>
          ) : null}
        </Container>
      </main>
      <Footer />
    </>
  );
}
