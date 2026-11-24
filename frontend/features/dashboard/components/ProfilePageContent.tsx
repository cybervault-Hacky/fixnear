'use client';

import { useId, useState, type FormEvent } from 'react';
import { Mail, Phone, UserRound } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { DashboardActionButton } from '@/features/dashboard/components/DashboardActionButton';
import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { DashboardTextField } from '@/features/dashboard/components/DashboardFields';
import { useDashboardDemo } from '@/features/dashboard/context/DashboardDemoContext';
import type { ProfileDetails } from '@/features/dashboard/types/dashboard';

type ProfileErrors = Partial<Record<keyof ProfileDetails, string>>;

function validateProfile(profile: ProfileDetails): ProfileErrors {
  const errors: ProfileErrors = {};
  const name = profile.fullName.trim();
  const email = profile.email.trim();
  const phoneDigits = profile.phone.replace(/\D/g, '');

  if (!name) errors.fullName = 'Enter a name for this demo profile.';
  if (name.length > 80) errors.fullName = 'Keep the name to 80 characters or fewer.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Enter an email in a valid format, such as demo@example.test.';
  }
  if (profile.phone.trim() && (phoneDigits.length < 10 || phoneDigits.length > 15)) {
    errors.phone = 'Enter 10–15 digits, or leave this optional sample field blank.';
  }

  return errors;
}

export function ProfilePageContent() {
  const { profile, updateProfile } = useDashboardDemo();
  const [draft, setDraft] = useState<ProfileDetails>(() => ({ ...profile }));
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [feedback, setFeedback] = useState('');
  const fullNameId = useId();
  const emailId = useId();
  const phoneId = useId();

  const updateField = (field: keyof ProfileDetails, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFeedback('');
  };

  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateProfile(draft);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setFeedback('');
      return;
    }

    const savedProfile = {
      fullName: draft.fullName.trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim(),
    };
    updateProfile(savedProfile);
    setDraft(savedProfile);
    setFeedback('Profile changes saved for this dashboard session only.');
  };

  const cancelChanges = () => {
    setDraft({ ...profile });
    setErrors({});
    setFeedback('Unsaved changes were cancelled; saved demo values were restored.');
  };

  return (
    <>
      <DashboardPageHeader
        eyebrow="Profile · session-only demo"
        title="Your profile details."
        description="Edit the sample name, email and optional phone field. No account is created, and nothing is sent to a server."
        action={
          <Button href="/dashboard" variant="secondary" size="small">
            Back to overview
          </Button>
        }
      />

      <DashboardCard
        title="Profile information"
        description="Use fictional values only. Saved changes remain in dashboard client state until this page is refreshed."
        icon={UserRound}
      >
        <form noValidate onSubmit={saveProfile} className="grid gap-5">
          <div className="grid gap-5 md:grid-cols-2">
            <DashboardTextField
              id={fullNameId}
              name="fullName"
              label="Name"
              value={draft.fullName}
              onChange={(event) => updateField('fullName', event.currentTarget.value)}
              autoComplete="off"
              placeholder="Demo Customer"
              error={errors.fullName}
            />
            <DashboardTextField
              id={emailId}
              name="email"
              label="Email address"
              type="email"
              value={draft.email}
              onChange={(event) => updateField('email', event.currentTarget.value)}
              autoComplete="off"
              placeholder="demo@example.test"
              error={errors.email}
            />
            <DashboardTextField
              id={phoneId}
              name="phone"
              label="Phone number (optional)"
              type="tel"
              inputMode="tel"
              value={draft.phone}
              onChange={(event) => updateField('phone', event.currentTarget.value)}
              autoComplete="off"
              placeholder="Not provided in this demo"
              helperText="Optional. Leave blank rather than entering a real contact number."
              error={errors.phone}
            />
          </div>

          {Object.keys(errors).length > 0 ? (
            <p
              role="alert"
              className="rounded-xl border border-[#e9b8b2] bg-[#fff3f1] px-4 py-3 text-sm text-[#8d3028]"
            >
              Please correct the highlighted fields before saving.
            </p>
          ) : null}
          {feedback ? (
            <p
              role="status"
              aria-live="polite"
              className="rounded-xl bg-[#eef7e5] px-4 py-3 text-sm text-midnight"
            >
              {feedback}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 border-t border-midnight/8 pt-4 sm:flex-row sm:justify-end">
            <DashboardActionButton variant="secondary" onClick={cancelChanges}>
              Cancel changes
            </DashboardActionButton>
            <DashboardActionButton type="submit" variant="primary">
              Save profile
            </DashboardActionButton>
          </div>
        </form>
      </DashboardCard>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <InfoCard
          icon={Mail}
          title="Contact details"
          description="Email is checked for basic format. Phone is optional and validated only when entered."
        />
        <InfoCard
          icon={Phone}
          title="No sign-in or notifications"
          description="These fields do not register an account, send email or text messages, or enable account recovery."
        />
      </div>
    </>
  );
}

type InfoCardProps = {
  icon: typeof Mail;
  title: string;
  description: string;
};

function InfoCard({ icon: Icon, title, description }: InfoCardProps) {
  return (
    <article className="flex min-w-0 items-start gap-3 rounded-2xl border border-midnight/10 bg-white p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f1f5ed] text-midnight">
        <Icon aria-hidden="true" size={17} />
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-midnight">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-midnight/60">{description}</p>
      </div>
    </article>
  );
}
