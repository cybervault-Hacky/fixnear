'use client';

import { useId, useState, type ChangeEvent, type FormEvent } from 'react';
import { FileText, Mail, Phone, UserRound } from 'lucide-react';

import { DashboardActionButton } from '@/features/dashboard/components/DashboardActionButton';
import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import {
  TechnicianInput,
  TechnicianTextArea,
} from '@/features/technician/components/TechnicianFields';
import { useTechnicianDemo } from '@/features/technician/context/TechnicianDemoContext';
import type { TechnicianProfile } from '@/features/technician/types/technician';

type ProfileErrors = Partial<Record<keyof TechnicianProfile, string>>;

function validateProfile(profile: TechnicianProfile): ProfileErrors {
  const errors: ProfileErrors = {};
  const name = profile.fullName.trim();
  const email = profile.email.trim();
  const phoneDigits = profile.phone.replace(/\D/g, '');
  const experience = Number(profile.yearsExperience);
  const description = profile.professionalDescription.trim();

  if (!name) errors.fullName = 'Enter a fictional name for this sample profile.';
  else if (name.length > 80) errors.fullName = 'Keep the name to 80 characters or fewer.';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Enter an email in a valid format, such as demo@example.test.';
  }

  if (profile.phone.trim() && (phoneDigits.length < 10 || phoneDigits.length > 15)) {
    errors.phone = 'Enter 10–15 digits, or leave this optional sample field blank.';
  }

  if (
    !profile.yearsExperience.trim() ||
    !Number.isInteger(experience) ||
    experience < 0 ||
    experience > 60
  ) {
    errors.yearsExperience = 'Enter a whole number from 0 to 60 for this demo.';
  }

  if (description.length < 30) {
    errors.professionalDescription = 'Add at least 30 characters to the sample description.';
  } else if (description.length > 500) {
    errors.professionalDescription = 'Keep the description to 500 characters or fewer.';
  }

  return errors;
}

export function TechnicianProfilePage() {
  const { profile, saveProfile } = useTechnicianDemo();
  const [draft, setDraft] = useState<TechnicianProfile>(() => ({ ...profile }));
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [feedback, setFeedback] = useState('');
  const fullNameId = useId();
  const emailId = useId();
  const phoneId = useId();
  const experienceId = useId();
  const descriptionId = useId();

  const updateField = (field: keyof TechnicianProfile, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFeedback('');
  };

  const handleTextChange =
    (field: keyof TechnicianProfile) => (event: ChangeEvent<HTMLInputElement>) =>
      updateField(field, event.currentTarget.value);

  const saveCurrentProfile = (event: FormEvent<HTMLFormElement>) => {
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
      professionalDescription: draft.professionalDescription.trim(),
      yearsExperience: draft.yearsExperience.trim(),
    };
    saveProfile(savedProfile);
    setDraft(savedProfile);
    setFeedback('Fictional profile changes saved in this browser session only.');
  };

  const cancelChanges = () => {
    setDraft({ ...profile });
    setErrors({});
    setFeedback('Unsaved profile changes were cancelled.');
  };

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <>
      <DashboardPageHeader
        eyebrow="Technician profile · local demo"
        title="Set up a professional profile preview."
        description="Edit fictional profile details and sample contact information. This is not registration, and no profile is submitted or connected to an account."
      />

      <DashboardCard
        title="Professional profile details"
        description="Use example information only. Saved edits remain in client-side state and reset when this page is refreshed."
        icon={UserRound}
      >
        <form noValidate onSubmit={saveCurrentProfile} className="grid gap-5">
          <div className="grid min-w-0 gap-5 md:grid-cols-2">
            <TechnicianInput
              id={fullNameId}
              name="fullName"
              label="Full name"
              value={draft.fullName}
              onChange={handleTextChange('fullName')}
              placeholder="Demo Technician"
              error={errors.fullName}
              maxLength={80}
            />
            <TechnicianInput
              id={emailId}
              name="email"
              label="Email address"
              type="email"
              value={draft.email}
              onChange={handleTextChange('email')}
              placeholder="demo@example.test"
              helperText="Use a reserved .test example address; this field does not send email."
              error={errors.email}
            />
            <TechnicianInput
              id={phoneId}
              name="phone"
              label="Phone number (fictional sample)"
              type="tel"
              inputMode="tel"
              value={draft.phone}
              onChange={handleTextChange('phone')}
              placeholder="00000 00000"
              helperText="Do not enter a real phone number. No messages or calls are sent."
              error={errors.phone}
            />
            <TechnicianInput
              id={experienceId}
              name="yearsExperience"
              label="Total years of experience (example)"
              type="number"
              inputMode="numeric"
              min={0}
              max={60}
              step={1}
              value={draft.yearsExperience}
              onChange={handleTextChange('yearsExperience')}
              helperText="A fictional sample value, not a verified work-history claim."
              error={errors.yearsExperience}
            />
          </div>

          <TechnicianTextArea
            id={descriptionId}
            name="professionalDescription"
            label="Professional description"
            value={draft.professionalDescription}
            onChange={(event) => updateField('professionalDescription', event.currentTarget.value)}
            placeholder="A fictional description for the dashboard preview."
            helperText="30–500 characters. Do not include real contact, identity, license or customer data."
            maxLength={500}
            error={errors.professionalDescription}
            rows={5}
          />

          {hasErrors ? (
            <p
              role="alert"
              className="rounded-xl border border-[#e9b8b2] bg-[#fff3f1] px-4 py-3 text-sm text-[#8d3028]"
            >
              Please correct the highlighted fields before saving this sample profile.
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

      <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
        <ProfileInfoCard
          icon={FileText}
          title="Professional description"
          description="This text is editable sample copy only; it is not published or checked for qualifications."
        />
        <ProfileInfoCard
          icon={Mail}
          title="Private by design in this preview"
          description="No account registration, authentication, customer messaging, contact verification or real phone collection is implemented."
        />
        <ProfileInfoCard
          icon={Phone}
          title="Fictional contact fields"
          description="Contact values are placeholders for form-layout testing and are never used to contact anyone."
        />
      </div>
    </>
  );
}

type ProfileInfoCardProps = {
  icon: typeof FileText;
  title: string;
  description: string;
};

function ProfileInfoCard({ icon: Icon, title, description }: ProfileInfoCardProps) {
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
