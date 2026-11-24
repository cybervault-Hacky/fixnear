'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Check, RotateCcw, Wrench } from 'lucide-react';

import { DashboardActionButton } from '@/features/dashboard/components/DashboardActionButton';
import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardEmptyState } from '@/features/dashboard/components/DashboardEmptyState';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { TechnicianInput } from '@/features/technician/components/TechnicianFields';
import { TECHNICIAN_SERVICE_CATEGORIES } from '@/features/technician/data/demo-data';
import { useTechnicianDemo } from '@/features/technician/context/TechnicianDemoContext';
import type {
  TechnicianServiceId,
  TechnicianServiceSkill,
} from '@/features/technician/types/technician';

type ServiceErrors = Partial<Record<TechnicianServiceId, string>>;

function copyServices(services: readonly TechnicianServiceSkill[]) {
  return services.map((service) => ({ ...service }));
}

function validateServices(services: readonly TechnicianServiceSkill[]): ServiceErrors {
  const errors: ServiceErrors = {};

  for (const service of services) {
    if (!service.selected) continue;
    const experience = Number(service.yearsExperience);
    if (
      !service.yearsExperience.trim() ||
      !Number.isInteger(experience) ||
      experience < 0 ||
      experience > 60
    ) {
      errors[service.id] = 'Enter a whole number from 0 to 60 for this fictional category.';
    }
  }

  return errors;
}

export function TechnicianServicesPage() {
  const { services, saveServices } = useTechnicianDemo();
  const [draft, setDraft] = useState<TechnicianServiceSkill[]>(() => copyServices(services));
  const [errors, setErrors] = useState<ServiceErrors>({});
  const [feedback, setFeedback] = useState('');
  const selectedServices = draft.filter((service) => service.selected);

  const updateService = (id: TechnicianServiceId, patch: Partial<TechnicianServiceSkill>) => {
    setDraft((current) =>
      current.map((service) => (service.id === id ? { ...service, ...patch } : service)),
    );
    setErrors((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
    setFeedback('');
  };

  const handleExperienceChange =
    (id: TechnicianServiceId) => (event: ChangeEvent<HTMLInputElement>) =>
      updateService(id, { yearsExperience: event.currentTarget.value });

  const saveCurrentServices = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateServices(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setFeedback('');
      return;
    }

    const savedServices = copyServices(draft);
    saveServices(savedServices);
    setDraft(savedServices);
    setFeedback(
      'Sample service selections saved in this browser session only. These are not verified skills.',
    );
  };

  const resetChanges = () => {
    setDraft(copyServices(services));
    setErrors({});
    setFeedback('Unsaved service changes were reset to the saved demo selections.');
  };

  return (
    <>
      <DashboardPageHeader
        eyebrow="Services & skills · fictional selections"
        title="Choose the services to show in this demo."
        description="Select from six FixNear service categories and add example experience values. Selections are local UI preferences, not credentials, licences, certifications or verified skills."
      />

      <div className="grid min-w-0 gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <DashboardCard
          title="Service categories"
          description="Choose any categories for the sample profile. Experience values accept whole years from 0 to 60."
          icon={Wrench}
        >
          <form noValidate onSubmit={saveCurrentServices} className="grid gap-5">
            <fieldset>
              <legend className="sr-only">
                Choose fictional service categories and experience
              </legend>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                {TECHNICIAN_SERVICE_CATEGORIES.map(({ id, title, description, icon: Icon }) => {
                  const skill = draft.find((service) => service.id === id);
                  if (!skill) return null;
                  const checkboxId = `service-${id}`;
                  const error = errors[id];

                  return (
                    <article
                      key={id}
                      className={`min-w-0 rounded-2xl border p-4 transition-colors motion-reduce:transition-none ${skill.selected ? 'border-midnight/25 bg-[#f8faf7]' : 'border-midnight/10 bg-white'}`}
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f1f5ed] text-midnight">
                          <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <label
                            htmlFor={checkboxId}
                            className="block cursor-pointer break-words text-sm font-semibold leading-5 text-midnight"
                          >
                            {title}
                          </label>
                          <p className="mt-1 text-xs leading-5 text-midnight/55">{description}</p>
                        </div>
                        <input
                          id={checkboxId}
                          type="checkbox"
                          checked={skill.selected}
                          onChange={(event) =>
                            updateService(id, { selected: event.currentTarget.checked })
                          }
                          className="mt-1 size-5 shrink-0 cursor-pointer accent-[#101827] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
                        />
                      </div>
                      {skill.selected ? (
                        <div className="mt-4 border-t border-midnight/8 pt-3">
                          <TechnicianInput
                            id={`experience-${id}`}
                            name={`experience-${id}`}
                            label={`Years of experience for ${title} (example)`}
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={60}
                            step={1}
                            value={skill.yearsExperience}
                            onChange={handleExperienceChange(id)}
                            helperText="Fictional value only; not a qualification check."
                            error={error}
                          />
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </fieldset>

            {Object.keys(errors).length > 0 ? (
              <p
                role="alert"
                className="rounded-xl border border-[#e9b8b2] bg-[#fff3f1] px-4 py-3 text-sm text-[#8d3028]"
              >
                Correct the highlighted sample experience fields before saving.
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
              <DashboardActionButton variant="secondary" onClick={resetChanges}>
                <RotateCcw aria-hidden="true" size={15} /> Reset changes
              </DashboardActionButton>
              <DashboardActionButton type="submit" variant="primary">
                Save service selections
              </DashboardActionButton>
            </div>
          </form>
        </DashboardCard>

        <div className="grid min-w-0 content-start gap-5">
          <DashboardCard
            title="Selected services summary"
            description="This preview updates as you choose fictional categories."
            icon={Check}
          >
            {selectedServices.length === 0 ? (
              <DashboardEmptyState
                compact
                icon={Wrench}
                title="No service categories selected"
                description="Select one or more categories to preview how they might appear on a sample profile."
              />
            ) : (
              <ul className="grid gap-2">
                {selectedServices.map((service) => {
                  const category = TECHNICIAN_SERVICE_CATEGORIES.find(
                    ({ id }) => id === service.id,
                  );
                  if (!category) return null;
                  return (
                    <li
                      key={service.id}
                      className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-midnight/10 bg-[#f8faf7] px-3.5 py-3"
                    >
                      <span className="min-w-0 break-words text-sm font-semibold text-midnight">
                        {category.title}
                      </span>
                      <span className="shrink-0 text-xs text-midnight/55">
                        {service.yearsExperience || '—'} sample years
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </DashboardCard>

          <div className="rounded-2xl border border-midnight/10 bg-white p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f1f5ed] text-midnight">
                <Wrench aria-hidden="true" size={17} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-midnight">
                  Selections are not verified skills
                </h2>
                <p className="mt-2 text-xs leading-5 text-midnight/60">
                  This page does not assess trade ability, issue a certification, or confirm
                  professional experience. No employer or customer can see these session-only sample
                  values.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
