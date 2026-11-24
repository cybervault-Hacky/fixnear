'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CalendarDays,
  Check,
  Database,
  LoaderCircle,
  MapPinned,
  ShieldCheck,
  UserRound,
  Wrench,
} from 'lucide-react';

import { DashboardActionButton } from '@/features/dashboard/components/DashboardActionButton';
import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import {
  TechnicianInput,
  TechnicianTextArea,
} from '@/features/technician/components/TechnicianFields';
import { FixNearApiError } from '@/lib/api/client';
import {
  getTechnicianAvailability,
  getTechnicianCoverage,
  getTechnicianOnboarding,
  getTechnicianProfile,
  getTechnicianSkills,
  submitTechnicianVerification,
  updateTechnicianAvailability,
  updateTechnicianCoverage,
  updateTechnicianProfile,
  updateTechnicianSkills,
} from '@/lib/api/technician-management';
import type {
  TechnicianAvailability,
  TechnicianCoverageArea,
  TechnicianOnboarding,
  TechnicianProfile,
  TechnicianSkill,
  TechnicianWeekday,
  WeeklyAvailability,
} from '@/lib/api/technician-management';
import { listPublicServices } from '@/lib/api/service-catalog';
import type { ServiceGuide } from '@/lib/api/service-catalog';

const weekdays: readonly { id: TechnicianWeekday; label: string; short: string }[] = [
  { id: 'monday', label: 'Monday', short: 'MON' },
  { id: 'tuesday', label: 'Tuesday', short: 'TUE' },
  { id: 'wednesday', label: 'Wednesday', short: 'WED' },
  { id: 'thursday', label: 'Thursday', short: 'THU' },
  { id: 'friday', label: 'Friday', short: 'FRI' },
  { id: 'saturday', label: 'Saturday', short: 'SAT' },
  { id: 'sunday', label: 'Sunday', short: 'SUN' },
];

type CoverageDraft = Omit<TechnicianCoverageArea, 'id' | 'center_latitude' | 'center_longitude'> & {
  center_latitude: string;
  center_longitude: string;
};
type ProfileDraft = {
  display_name: string;
  professional_description: string;
  years_experience: string;
};
type ApiLoadState = 'loading' | 'ready' | 'unauthorized' | 'unavailable';

type PageState = {
  loadState: ApiLoadState;
  loadMessage: string;
  profile: TechnicianProfile | null;
  services: ServiceGuide[];
  skills: TechnicianSkill[];
  coverage: TechnicianCoverageArea[];
  availability: TechnicianAvailability | null;
  onboarding: TechnicianOnboarding | null;
};

function emptyWeeklyAvailability(): WeeklyAvailability {
  return Object.fromEntries(
    weekdays.map(({ id }) => [id, { available: false, start: null, end: null }]),
  ) as WeeklyAvailability;
}

function asCoverageDraft(areas: TechnicianCoverageArea[]): CoverageDraft[] {
  return areas.map((area) => ({
    area_name: area.area_name,
    city: area.city,
    state: area.state,
    postal_code: area.postal_code,
    center_latitude: area.center_latitude === null ? '' : String(area.center_latitude),
    center_longitude: area.center_longitude === null ? '' : String(area.center_longitude),
  }));
}

function optionalCoordinate(value: string, min: number, max: number): number | null | undefined {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

function apiFailureMessage(error: unknown): string {
  if (error instanceof FixNearApiError) {
    if (error.status === 401) {
      return 'No authenticated technician session was found. Sign in through the configured FixNear authentication flow, then reload this page.';
    }
    if (error.status === 403) {
      return 'The active account is not authorized for technician self-service. Customer and technician roles are separate.';
    }
    if (error.status === 404) {
      return 'No technician profile is provisioned for this authenticated account.';
    }
    if (error.status === 503) {
      return 'The database API is not configured or is temporarily unavailable. No local sample data is shown in this management view.';
    }
    return error.message;
  }
  return 'The database API could not be reached. Please try again later.';
}

function statusLabel(status: TechnicianOnboarding['verification_status']): string {
  const labels: Record<TechnicianOnboarding['verification_status'], string> = {
    not_submitted: 'Not submitted',
    pending_review: 'Pending admin review',
    approved: 'Approved by an admin',
    rejected: 'Rejected · review the admin note',
  };
  return labels[status];
}

export function TechnicianApiManagementPage() {
  const [page, setPage] = useState<PageState>({
    loadState: 'loading',
    loadMessage: '',
    profile: null,
    services: [],
    skills: [],
    coverage: [],
    availability: null,
    onboarding: null,
  });
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>({
    display_name: '',
    professional_description: '',
    years_experience: '',
  });
  const [skillYears, setSkillYears] = useState<Record<string, string>>({});
  const [coverageDraft, setCoverageDraft] = useState<CoverageDraft[]>([]);
  const [availabilityDraft, setAvailabilityDraft] =
    useState<WeeklyAvailability>(emptyWeeklyAvailability);
  const [timezoneName, setTimezoneName] = useState('Asia/Kolkata');
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [actionError, setActionError] = useState('');
  const profileNameId = useId();
  const profileExperienceId = useId();
  const profileDescriptionId = useId();

  useEffect(() => {
    let active = true;
    void Promise.all([
      getTechnicianProfile(),
      listPublicServices(),
      getTechnicianSkills(),
      getTechnicianCoverage(),
      getTechnicianAvailability(),
      getTechnicianOnboarding(),
    ])
      .then(([profile, services, skills, coverage, availability, onboarding]) => {
        if (!active) return;
        const nextSkillYears = Object.fromEntries(
          skills.skills.map((skill) => [
            skill.service_slug,
            skill.years_experience === null ? '' : String(skill.years_experience),
          ]),
        );
        const weeklySchedule = Object.fromEntries(
          weekdays.map(({ id }) => {
            const preference = availability.weekly_schedule[id];
            return [
              id,
              {
                available: preference.available,
                start: preference.start?.slice(0, 5) ?? null,
                end: preference.end?.slice(0, 5) ?? null,
              },
            ];
          }),
        ) as WeeklyAvailability;
        setPage({
          loadState: 'ready',
          loadMessage: '',
          profile,
          services,
          skills: skills.skills,
          coverage: coverage.areas,
          availability,
          onboarding,
        });
        setProfileDraft({
          display_name: profile.display_name,
          professional_description: profile.professional_description,
          years_experience:
            profile.years_experience === null ? '' : String(profile.years_experience),
        });
        setSkillYears(nextSkillYears);
        setCoverageDraft(asCoverageDraft(coverage.areas));
        setAvailabilityDraft(weeklySchedule);
        setTimezoneName(availability.timezone_name);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = apiFailureMessage(error);
        const isUnauthorized =
          error instanceof FixNearApiError && [401, 403].includes(error.status);
        setPage((current) => ({
          ...current,
          loadState: isUnauthorized ? 'unauthorized' : 'unavailable',
          loadMessage: message,
        }));
      });
    return () => {
      active = false;
    };
  }, []);

  const refreshOnboarding = async () => {
    const onboarding = await getTechnicianOnboarding();
    setPage((current) => ({ ...current, onboarding }));
    return onboarding;
  };

  const withAction = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    setFeedback('');
    setActionError('');
    try {
      await action();
    } catch (error) {
      setActionError(apiFailureMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const displayName = profileDraft.display_name.trim();
    const description = profileDraft.professional_description.trim();
    const experience = profileDraft.years_experience.trim();
    if (!displayName || !description) {
      setActionError('Enter a display name and professional description before saving.');
      return;
    }
    if (description.length < 30) {
      setActionError('The professional description must contain at least 30 characters.');
      return;
    }
    if (experience && (!/^\d+$/.test(experience) || Number(experience) > 60)) {
      setActionError('Years of experience must be a whole number from 0 to 60, or left blank.');
      return;
    }
    void withAction('profile', async () => {
      const profile = await updateTechnicianProfile({
        display_name: displayName,
        professional_description: description,
        years_experience: experience ? Number(experience) : null,
      });
      setPage((current) => ({ ...current, profile }));
      setProfileDraft({
        display_name: profile.display_name,
        professional_description: profile.professional_description,
        years_experience: profile.years_experience === null ? '' : String(profile.years_experience),
      });
      await refreshOnboarding();
      setFeedback('Private profile changes saved to the technician account.');
    });
  };

  const toggleSkill = (slug: string, selected: boolean) => {
    setPage((current) => {
      const existing = new Map(current.skills.map((skill) => [skill.service_slug, skill]));
      if (selected) {
        if (!existing.has(slug)) {
          existing.set(slug, {
            service_id: '',
            service_slug: slug,
            title: current.services.find((service) => service.slug === slug)?.title ?? slug,
            is_active: true,
            years_experience: null,
          });
        }
      } else {
        existing.delete(slug);
      }
      return { ...current, skills: [...existing.values()] };
    });
  };

  const saveSkills = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const invalidSkill = page.skills.find((skill) => {
      const years = skillYears[skill.service_slug]?.trim() ?? '';
      return years && (!Number.isInteger(Number(years)) || Number(years) < 0 || Number(years) > 60);
    });
    if (invalidSkill) {
      setActionError('Each skill experience value must be a whole number from 0 to 60.');
      return;
    }
    void withAction('skills', async () => {
      const skills = page.skills
        .filter((skill) => skill.is_active)
        .map((skill) => {
          const years = skillYears[skill.service_slug]?.trim() ?? '';
          return {
            service_slug: skill.service_slug,
            years_experience: years ? Number(years) : null,
          };
        });
      const result = await updateTechnicianSkills({ skills });
      setPage((current) => ({ ...current, skills: result.skills }));
      setSkillYears(
        Object.fromEntries(
          result.skills.map((skill) => [
            skill.service_slug,
            skill.years_experience === null ? '' : String(skill.years_experience),
          ]),
        ),
      );
      await refreshOnboarding();
      setFeedback(
        'Selected service skills saved to the private technician profile. These are self-reported, not verified.',
      );
    });
  };

  const updateCoverage = (index: number, field: keyof CoverageDraft, value: string) => {
    setCoverageDraft((current) =>
      current.map((area, row) => (row === index ? { ...area, [field]: value } : area)),
    );
  };

  const saveCoverage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      coverageDraft.some(
        (area) => !area.area_name.trim() || !area.city.trim() || !area.state.trim(),
      )
    ) {
      setActionError('Each service area needs an area name, city and state.');
      return;
    }
    const normalizedCoverage = coverageDraft.map((area) => ({
      ...area,
      center_latitude: optionalCoordinate(area.center_latitude, -90, 90),
      center_longitude: optionalCoordinate(area.center_longitude, -180, 180),
    }));
    if (
      normalizedCoverage.some(
        (area) =>
          area.center_latitude === undefined ||
          area.center_longitude === undefined ||
          (area.center_latitude === null) !== (area.center_longitude === null),
      )
    ) {
      setActionError('Enter both valid service-area center coordinates, or leave both blank.');
      return;
    }
    void withAction('coverage', async () => {
      const result = await updateTechnicianCoverage({
        areas: normalizedCoverage.map((area) => ({
          area_name: area.area_name.trim(),
          city: area.city.trim(),
          state: area.state.trim(),
          postal_code: area.postal_code.trim(),
          center_latitude: area.center_latitude as number | null,
          center_longitude: area.center_longitude as number | null,
        })),
      });
      setPage((current) => ({ ...current, coverage: result.areas }));
      setCoverageDraft(asCoverageDraft(result.areas));
      await refreshOnboarding();
      setFeedback('Service-area preferences saved to the private technician profile.');
    });
  };

  const updateAvailabilityDay = (
    weekday: TechnicianWeekday,
    changes: Partial<WeeklyAvailability[TechnicianWeekday]>,
  ) => {
    setAvailabilityDraft((current) => ({
      ...current,
      [weekday]: { ...current[weekday], ...changes },
    }));
  };

  const saveAvailability = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    for (const { id, label } of weekdays) {
      const day = availabilityDraft[id];
      if (day.available && (!day.start || !day.end || day.start >= day.end)) {
        setActionError(`${label} needs a valid start time earlier than its end time.`);
        return;
      }
    }
    void withAction('availability', async () => {
      const weeklySchedule = Object.fromEntries(
        weekdays.map(({ id }) => {
          const day = availabilityDraft[id];
          return [
            id,
            {
              available: day.available,
              start: day.available ? day.start : null,
              end: day.available ? day.end : null,
            },
          ];
        }),
      ) as WeeklyAvailability;
      const availability = await updateTechnicianAvailability({
        timezone_name: timezoneName.trim(),
        weekly_schedule: weeklySchedule,
      });
      setPage((current) => ({ ...current, availability }));
      setFeedback(
        'Weekly availability preferences saved. They do not represent live appointment slots.',
      );
    });
  };

  const submitVerification = () => {
    void withAction('verification', async () => {
      const verification = await submitTechnicianVerification();
      const onboarding = await refreshOnboarding();
      setPage((current) => ({
        ...current,
        profile: current.profile
          ? {
              ...current.profile,
              verification_status: verification.verification_status,
              verification_submitted_at: verification.verification_submitted_at,
              verification_reviewed_at: verification.verification_reviewed_at,
            }
          : current.profile,
        onboarding: {
          ...onboarding,
          verification_status: verification.verification_status,
        },
      }));
      setFeedback(
        'Verification request submitted for authorized admin review. Submission is not approval.',
      );
    });
  };

  if (page.loadState === 'loading') {
    return (
      <>
        <DashboardPageHeader
          eyebrow="Private technician account · database API"
          title="Manage your technician profile."
          description="Loading account-scoped profile and preference data from the FixNear API."
        />
        <div className="flex min-h-40 items-center gap-3 rounded-2xl border border-midnight/10 bg-white p-6 text-sm text-midnight/65">
          <LoaderCircle
            aria-hidden="true"
            className="animate-spin motion-reduce:animate-none"
            size={18}
          />
          Connecting to the technician API…
        </div>
      </>
    );
  }

  if (page.loadState !== 'ready' || !page.profile || !page.onboarding || !page.availability) {
    return (
      <>
        <DashboardPageHeader
          eyebrow="Private technician account · database API"
          title="Technician management is protected."
          description="This page does not show the local demo profile. It loads private data only after the API confirms an authorized technician account."
        />
        <DashboardCard
          title="Technician API connection required"
          description={page.loadMessage}
          icon={Database}
        >
          <div className="flex items-start gap-3 rounded-xl border border-midnight/10 bg-[#f8faf7] p-4">
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-midnight/55"
              size={18}
            />
            <p className="text-sm leading-6 text-midnight/70">
              No technician profile, contact details, availability or verification status are
              displayed.
            </p>
          </div>
          <a
            href="/technician"
            className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-midnight px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
          >
            Return to the clearly labelled demo workspace
          </a>
        </DashboardCard>
      </>
    );
  }

  const selectedSlugs = new Set(
    page.skills.filter((skill) => skill.is_active).map((skill) => skill.service_slug),
  );
  const inactiveSkills = page.skills.filter((skill) => !skill.is_active);
  const verificationStatus = page.onboarding.verification_status;
  const canSubmit =
    page.onboarding.onboarding_status === 'complete' &&
    !['pending_review', 'approved'].includes(verificationStatus);

  return (
    <>
      <DashboardPageHeader
        eyebrow="Private technician account · database API"
        title="Manage your technician profile."
        description="Update your own account-backed profile, service skills, coverage areas and weekly preferences. Submitted information remains pending until an authorized admin reviews it."
      />

      {actionError ? (
        <p
          role="alert"
          className="mb-5 rounded-xl border border-[#e9b8b2] bg-[#fff3f1] px-4 py-3 text-sm text-[#8d3028]"
        >
          {actionError}
        </p>
      ) : null}
      {feedback ? (
        <p
          role="status"
          aria-live="polite"
          className="mb-5 rounded-xl bg-[#eef7e5] px-4 py-3 text-sm text-midnight"
        >
          {feedback}
        </p>
      ) : null}

      <div className="grid gap-5">
        <DashboardCard
          title="Profile details"
          description={`Signed-in account: ${page.profile.email ?? 'email not supplied'}. Account identity and role are not editable here.`}
          icon={UserRound}
        >
          <form noValidate onSubmit={saveProfile} className="grid gap-5">
            <div className="grid gap-5 md:grid-cols-2">
              <TechnicianInput
                id={profileNameId}
                name="display_name"
                label="Display name"
                value={profileDraft.display_name}
                onChange={(event) =>
                  setProfileDraft((current) => ({
                    ...current,
                    display_name: event.currentTarget.value,
                  }))
                }
                maxLength={120}
              />
              <TechnicianInput
                id={profileExperienceId}
                name="years_experience"
                label="Years of experience · self-reported"
                type="number"
                min={0}
                max={60}
                step={1}
                value={profileDraft.years_experience}
                onChange={(event) =>
                  setProfileDraft((current) => ({
                    ...current,
                    years_experience: event.currentTarget.value,
                  }))
                }
                helperText="Optional; this value is not verified by this form."
              />
            </div>
            <TechnicianTextArea
              id={profileDescriptionId}
              name="professional_description"
              label="Professional description"
              value={profileDraft.professional_description}
              onChange={(event) =>
                setProfileDraft((current) => ({
                  ...current,
                  professional_description: event.currentTarget.value,
                }))
              }
              maxLength={2000}
              helperText="At least 30 characters; describe your own experience accurately."
              rows={4}
            />
            <div className="flex justify-end border-t border-midnight/8 pt-4">
              <DashboardActionButton type="submit" variant="primary" disabled={busy !== null}>
                <Check aria-hidden="true" size={15} />{' '}
                {busy === 'profile' ? 'Saving…' : 'Save profile'}
              </DashboardActionButton>
            </div>
          </form>
        </DashboardCard>

        <DashboardCard
          title="Service skills"
          description="Choose from currently active service guides. Skills and years remain self-reported; selecting a service does not imply credentials or verification."
          icon={Wrench}
        >
          {inactiveSkills.length > 0 ? (
            <p className="mb-4 rounded-xl border border-midnight/10 bg-[#f8faf7] p-4 text-xs leading-5 text-midnight/65">
              {inactiveSkills.map((skill) => skill.title).join(', ')} are saved against inactive
              catalog entries and cannot be selected now. Saving the active skill list will remove
              those unavailable entries from this profile.
            </p>
          ) : null}
          <form onSubmit={saveSkills} className="grid gap-4">
            {page.services.length === 0 ? (
              <p className="rounded-xl border border-dashed border-midnight/15 bg-[#f8faf7] p-4 text-sm text-midnight/65">
                No active service guides are available in the catalog.
              </p>
            ) : (
              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="sr-only">Select service skills</legend>
                {page.services.map((service) => {
                  const selected = selectedSlugs.has(service.slug);
                  const skill = page.skills.find((item) => item.service_slug === service.slug);
                  return (
                    <div
                      key={service.id}
                      className={`rounded-xl border p-4 ${selected ? 'border-midnight/25 bg-[#f8faf7]' : 'border-midnight/10 bg-white'}`}
                    >
                      <label className="flex min-h-11 items-start gap-3 text-sm font-semibold text-midnight">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) =>
                            toggleSkill(service.slug, event.currentTarget.checked)
                          }
                          className="mt-0.5 size-5 shrink-0 accent-[#101827] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
                        />
                        <span>{service.title}</span>
                      </label>
                      {selected ? (
                        <div className="mt-3 border-t border-midnight/8 pt-3">
                          <TechnicianInput
                            id={`skill-years-${service.slug}`}
                            name={`skill-years-${service.slug}`}
                            label={`Self-reported years · ${service.title}`}
                            type="number"
                            min={0}
                            max={60}
                            step={1}
                            value={
                              skillYears[service.slug] ??
                              (skill?.years_experience == null
                                ? ''
                                : String(skill.years_experience))
                            }
                            onChange={(event) =>
                              setSkillYears((current) => ({
                                ...current,
                                [service.slug]: event.currentTarget.value,
                              }))
                            }
                            helperText="Optional; not a qualification check."
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </fieldset>
            )}
            <div className="flex justify-end border-t border-midnight/8 pt-4">
              <DashboardActionButton type="submit" variant="primary" disabled={busy !== null}>
                <Check aria-hidden="true" size={15} />{' '}
                {busy === 'skills' ? 'Saving…' : 'Save service skills'}
              </DashboardActionButton>
            </div>
          </form>
        </DashboardCard>

        <DashboardCard
          title="Service coverage areas"
          description="Store service areas, not a home address. Optional coordinates must be a known approximate center of the service area; public markers are rounded and never represent your live or residential location."
          icon={MapPinned}
        >
          <form onSubmit={saveCoverage} className="grid gap-4">
            {coverageDraft.length === 0 ? (
              <p className="rounded-xl border border-dashed border-midnight/15 bg-[#f8faf7] p-4 text-sm text-midnight/65">
                No service areas have been saved.
              </p>
            ) : null}
            {coverageDraft.map((area, index) => (
              <fieldset
                key={`coverage-${index}`}
                className="grid gap-3 rounded-xl border border-midnight/10 p-4 sm:grid-cols-2"
              >
                <legend className="px-1 text-xs font-semibold text-midnight/55">
                  Service area {index + 1}
                </legend>
                {(['area_name', 'city', 'state', 'postal_code'] as const).map((field) => (
                  <TechnicianInput
                    key={field}
                    id={`coverage-${index}-${field}`}
                    name={`coverage-${index}-${field}`}
                    label={
                      {
                        area_name: 'Area or locality',
                        city: 'City',
                        state: 'State or region',
                        postal_code: 'Postal code · optional',
                      }[field]
                    }
                    value={area[field]}
                    onChange={(event) => updateCoverage(index, field, event.currentTarget.value)}
                    maxLength={field === 'postal_code' ? 12 : 120}
                  />
                ))}
                <div className="grid gap-2 sm:col-span-2">
                  <p className="text-xs leading-5 text-midnight/55">
                    Optional approximate map center · leave both blank if no reliable coordinates
                    are known. Never enter a home or current-live location.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TechnicianInput
                      id={`coverage-${index}-center-latitude`}
                      name={`coverage-${index}-center-latitude`}
                      label="Service-area center latitude · optional"
                      type="number"
                      min={-90}
                      max={90}
                      step="any"
                      value={area.center_latitude}
                      onChange={(event) =>
                        updateCoverage(index, 'center_latitude', event.currentTarget.value)
                      }
                    />
                    <TechnicianInput
                      id={`coverage-${index}-center-longitude`}
                      name={`coverage-${index}-center-longitude`}
                      label="Service-area center longitude · optional"
                      type="number"
                      min={-180}
                      max={180}
                      step="any"
                      value={area.center_longitude}
                      onChange={(event) =>
                        updateCoverage(index, 'center_longitude', event.currentTarget.value)
                      }
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setCoverageDraft((current) => current.filter((_item, row) => row !== index))
                  }
                  className="min-h-10 w-fit rounded-lg px-3 text-xs font-semibold text-[#943329] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
                >
                  Remove service area
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              onClick={() =>
                setCoverageDraft((current) => [
                  ...current,
                  {
                    area_name: '',
                    city: '',
                    state: '',
                    postal_code: '',
                    center_latitude: '',
                    center_longitude: '',
                  },
                ])
              }
              className="min-h-11 w-fit rounded-xl border border-midnight/15 px-4 text-sm font-semibold text-midnight hover:bg-[#f8faf7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
            >
              Add a service area
            </button>
            <div className="flex justify-end border-t border-midnight/8 pt-4">
              <DashboardActionButton type="submit" variant="primary" disabled={busy !== null}>
                <Check aria-hidden="true" size={15} />{' '}
                {busy === 'coverage' ? 'Saving…' : 'Save service areas'}
              </DashboardActionButton>
            </div>
          </form>
        </DashboardCard>

        <DashboardCard
          title="Weekly availability preferences"
          description="Private planning preferences only. They do not create, publish or confirm appointment slots or real-time availability."
          icon={CalendarDays}
        >
          <form onSubmit={saveAvailability} className="grid gap-5">
            <TechnicianInput
              id="availability-timezone"
              name="timezone_name"
              label="Time zone"
              value={timezoneName}
              onChange={(event) => setTimezoneName(event.currentTarget.value)}
              maxLength={64}
              helperText="Use a recognized IANA time-zone name, such as Asia/Kolkata."
            />
            <fieldset className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <legend className="sr-only">Weekly time preferences</legend>
              {weekdays.map(({ id, label, short }) => {
                const day = availabilityDraft[id];
                return (
                  <div
                    key={id}
                    className={`rounded-xl border p-4 ${day.available ? 'border-midnight/20 bg-[#f8faf7]' : 'border-midnight/10 bg-white'}`}
                  >
                    <label className="flex min-h-10 items-center gap-3 text-sm font-semibold text-midnight">
                      <input
                        type="checkbox"
                        checked={day.available}
                        onChange={(event) =>
                          updateAvailabilityDay(id, {
                            available: event.currentTarget.checked,
                            start: event.currentTarget.checked ? day.start : null,
                            end: event.currentTarget.checked ? day.end : null,
                          })
                        }
                        className="size-5 shrink-0 accent-[#101827] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
                      />
                      <span className="grid size-8 place-items-center rounded-lg bg-white text-[0.62rem] font-bold text-midnight/60">
                        {short}
                      </span>
                      {label}
                    </label>
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-midnight/8 pt-3">
                      <TechnicianInput
                        id={`availability-${id}-start`}
                        name={`availability-${id}-start`}
                        label="Start"
                        type="time"
                        value={day.start ?? ''}
                        disabled={!day.available}
                        required={day.available}
                        onChange={(event) =>
                          updateAvailabilityDay(id, { start: event.currentTarget.value || null })
                        }
                      />
                      <TechnicianInput
                        id={`availability-${id}-end`}
                        name={`availability-${id}-end`}
                        label="End"
                        type="time"
                        value={day.end ?? ''}
                        disabled={!day.available}
                        required={day.available}
                        onChange={(event) =>
                          updateAvailabilityDay(id, { end: event.currentTarget.value || null })
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </fieldset>
            <div className="flex justify-end border-t border-midnight/8 pt-4">
              <DashboardActionButton type="submit" variant="primary" disabled={busy !== null}>
                <Check aria-hidden="true" size={15} />{' '}
                {busy === 'availability' ? 'Saving…' : 'Save preferences'}
              </DashboardActionButton>
            </div>
          </form>
        </DashboardCard>

        <DashboardCard
          title="Onboarding and verification"
          description="Submitting requests an admin review; it does not mark the profile verified. No identity document upload is offered in this foundation."
          icon={ShieldCheck}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-midnight/10 bg-[#f8faf7] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-midnight/50">
                Onboarding
              </p>
              <p className="mt-2 text-sm font-semibold text-midnight">
                {page.onboarding.onboarding_status === 'complete'
                  ? 'Required profile details complete'
                  : 'More profile details needed'}
              </p>
              {page.onboarding.missing_requirements.length > 0 ? (
                <ul className="mt-2 list-inside list-disc text-xs leading-5 text-midnight/60">
                  {page.onboarding.missing_requirements.map((requirement) => (
                    <li key={requirement}>{requirement.replaceAll('_', ' ')}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="rounded-xl border border-midnight/10 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-midnight/50">
                Verification status
              </p>
              <p className="mt-2 text-sm font-semibold text-midnight">
                {statusLabel(verificationStatus)}
              </p>
              {page.profile.verification_submitted_at ? (
                <p className="mt-1 text-xs text-midnight/55">
                  Submitted {new Date(page.profile.verification_submitted_at).toLocaleString()}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-3 border-t border-midnight/8 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-2xl text-xs leading-5 text-midnight/55">
              {canSubmit
                ? 'Your current profile can be submitted for a review. Only an authorized admin can approve or reject it.'
                : page.onboarding.onboarding_status !== 'complete'
                  ? 'Complete the required profile, at least one active service skill, and one coverage area before requesting review.'
                  : 'A request is already pending or has been approved. Profile changes may require a new admin review.'}
            </p>
            <DashboardActionButton
              type="button"
              variant="primary"
              onClick={submitVerification}
              disabled={!canSubmit || busy !== null}
            >
              <ShieldCheck aria-hidden="true" size={15} />{' '}
              {busy === 'verification' ? 'Submitting…' : 'Submit for admin review'}
            </DashboardActionButton>
          </div>
        </DashboardCard>

        <p className="flex items-start gap-2 text-xs leading-5 text-midnight/50">
          <Database aria-hidden="true" className="mt-0.5 shrink-0" size={14} />
          This page reads and writes database-backed account data. The API derives ownership from
          your authenticated identity; client-supplied user IDs and roles are not accepted.
        </p>
      </div>
    </>
  );
}
