'use client';

import { useState, type FormEvent } from 'react';
import { CalendarDays, RotateCcw } from 'lucide-react';

import { DashboardActionButton } from '@/features/dashboard/components/DashboardActionButton';
import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { TechnicianInput } from '@/features/technician/components/TechnicianFields';
import { cloneDemoAvailability, TECHNICIAN_DAYS } from '@/features/technician/data/demo-data';
import { useTechnicianDemo } from '@/features/technician/context/TechnicianDemoContext';
import type { TechnicianDay, WeeklyAvailability } from '@/features/technician/types/technician';

type AvailabilityErrors = Partial<Record<TechnicianDay, string>>;

function validateAvailability(availability: WeeklyAvailability): AvailabilityErrors {
  const errors: AvailabilityErrors = {};
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

  for (const { id } of TECHNICIAN_DAYS) {
    const day = availability[id];
    if (!day.available) continue;
    if (!timePattern.test(day.start) || !timePattern.test(day.end) || day.start >= day.end) {
      errors[id] = 'Choose a valid start time earlier than the end time.';
    }
  }

  return errors;
}

export function TechnicianAvailabilityPage() {
  const { availability, saveAvailability } = useTechnicianDemo();
  const [draft, setDraft] = useState<WeeklyAvailability>(() => cloneDemoAvailability(availability));
  const [errors, setErrors] = useState<AvailabilityErrors>({});
  const [feedback, setFeedback] = useState('');

  const updateDay = (id: TechnicianDay, changes: Partial<WeeklyAvailability[TechnicianDay]>) => {
    setDraft((current) => ({
      ...current,
      [id]: { ...current[id], ...changes },
    }));
    setErrors((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
    setFeedback('');
  };

  const saveSchedule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateAvailability(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setFeedback('');
      return;
    }

    const savedSchedule = cloneDemoAvailability(draft);
    saveAvailability(savedSchedule);
    setDraft(savedSchedule);
    setFeedback(
      'Weekly sample preferences saved in this browser session only. This is not live availability.',
    );
  };

  const resetChanges = () => {
    setDraft(cloneDemoAvailability(availability));
    setErrors({});
    setFeedback('Unsaved schedule changes were reset to the saved demo preferences.');
  };

  return (
    <>
      <DashboardPageHeader
        eyebrow="Availability · local preference preview"
        title="Set a weekly availability preview."
        description="Choose sample days and time ranges to preview a weekly schedule. Nothing is published, checked in real time, or connected to a booking or job assignment."
      />

      <DashboardCard
        title="Weekly schedule"
        description="Turn a day on or off and select a time range for this local demonstration only."
        icon={CalendarDays}
      >
        <form noValidate onSubmit={saveSchedule} className="grid gap-5">
          <fieldset>
            <legend className="sr-only">Weekly availability days and sample time ranges</legend>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {TECHNICIAN_DAYS.map(({ id, label, short }) => {
                const day = draft[id];
                const error = errors[id];
                const checkboxId = `day-${id}-available`;
                const startId = `day-${id}-start`;
                const endId = `day-${id}-end`;

                return (
                  <article
                    key={id}
                    className={`min-w-0 rounded-2xl border p-4 transition-colors motion-reduce:transition-none ${day.available ? 'border-midnight/20 bg-[#f8faf7]' : 'border-midnight/10 bg-white'}`}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          aria-hidden="true"
                          className={`grid size-10 shrink-0 place-items-center rounded-xl text-xs font-bold ${day.available ? 'bg-lime text-midnight' : 'bg-[#f1f3f5] text-midnight/55'}`}
                        >
                          {short}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-midnight">{label}</p>
                          <p className="mt-0.5 text-xs text-midnight/55">
                            {day.available ? 'Available in this demo' : 'Unavailable in this demo'}
                          </p>
                        </div>
                      </div>
                      <input
                        id={checkboxId}
                        type="checkbox"
                        checked={day.available}
                        onChange={(event) =>
                          updateDay(id, { available: event.currentTarget.checked })
                        }
                        aria-label={`Available ${label} in sample schedule`}
                        className="size-5 shrink-0 cursor-pointer accent-[#101827] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-midnight/8 pt-3">
                      <TechnicianInput
                        id={startId}
                        name={startId}
                        label={`${label} start time`}
                        type="time"
                        value={day.start}
                        onChange={(event) => updateDay(id, { start: event.currentTarget.value })}
                        disabled={!day.available}
                        helperText={day.available ? 'Sample start' : 'Day off'}
                      />
                      <TechnicianInput
                        id={endId}
                        name={endId}
                        label={`${label} end time`}
                        type="time"
                        value={day.end}
                        onChange={(event) => updateDay(id, { end: event.currentTarget.value })}
                        disabled={!day.available}
                        helperText={day.available ? 'Sample end' : 'Day off'}
                        error={error}
                      />
                    </div>
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
              Each available day needs a valid start time before its end time.
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
              Save weekly preview
            </DashboardActionButton>
          </div>
        </form>
      </DashboardCard>

      <div className="mt-5 rounded-2xl border border-midnight/10 bg-white p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-midnight">No real-time availability</h2>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-midnight/60 sm:text-sm sm:leading-6">
          The schedule above is a client-side UI example. It does not publish working hours, reserve
          appointments, notify anyone, confirm a technician is free, or create a booking.
        </p>
      </div>
    </>
  );
}
