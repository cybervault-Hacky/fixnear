'use client';

import { useId, useState } from 'react';
import { MapPinned, Plus, RotateCcw, Trash2 } from 'lucide-react';

import { DashboardActionButton } from '@/features/dashboard/components/DashboardActionButton';
import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardEmptyState } from '@/features/dashboard/components/DashboardEmptyState';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import {
  DEMO_COVERAGE_ZONES,
  DEMO_TECHNICIAN_COVERAGE_AREAS,
} from '@/features/technician/data/demo-data';
import { useTechnicianDemo } from '@/features/technician/context/TechnicianDemoContext';

export function TechnicianCoveragePage() {
  const { coverageAreas, saveCoverageAreas } = useTechnicianDemo();
  const [draftAreas, setDraftAreas] = useState<string[]>(() => [...coverageAreas]);
  const [selectedZone, setSelectedZone] = useState('');
  const [feedback, setFeedback] = useState('');
  const zoneSelectId = useId();
  const availableZones = DEMO_COVERAGE_ZONES.filter((zone) => !draftAreas.includes(zone));

  const addZone = () => {
    if (!selectedZone || draftAreas.includes(selectedZone)) return;
    setDraftAreas((current) => [...current, selectedZone]);
    setSelectedZone('');
    setFeedback('');
  };

  const removeZone = (zone: string) => {
    setDraftAreas((current) => current.filter((area) => area !== zone));
    setFeedback('');
  };

  const saveZones = () => {
    saveCoverageAreas(draftAreas);
    setFeedback(
      'Fictional coverage zones saved in this browser session only. They are not real service boundaries.',
    );
  };

  const resetChanges = () => {
    setDraftAreas([...coverageAreas]);
    setSelectedZone('');
    setFeedback('Unsaved coverage changes were reset to the saved demo zones.');
  };

  return (
    <>
      <DashboardPageHeader
        eyebrow="Service coverage · illustrative Pune zones"
        title="Choose broad Pune service zones."
        description="Build a simple coverage preview from broad fictional clusters. There is no map, geolocation, precise customer address, or real service boundary in this demonstration."
      />

      <div className="grid min-w-0 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <DashboardCard
          title="Add an illustrative zone"
          description="Choose a broad sample label; it is not an exact locality, customer location or live availability boundary."
          icon={MapPinned}
        >
          <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="grid min-w-0 gap-1.5">
              <label htmlFor={zoneSelectId} className="text-sm font-semibold text-midnight">
                Choose a Pune demo zone
              </label>
              <select
                id={zoneSelectId}
                value={selectedZone}
                onChange={(event) => setSelectedZone(event.currentTarget.value)}
                className="min-h-12 w-full min-w-0 rounded-xl border border-midnight/15 bg-white px-3.5 text-sm text-midnight outline-none transition hover:border-midnight/25 focus:border-midnight/50 focus:ring-2 focus:ring-lime/55 motion-reduce:transition-none"
              >
                <option value="">Select a broad sample zone</option>
                {availableZones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </div>
            <DashboardActionButton variant="primary" onClick={addZone} disabled={!selectedZone}>
              <Plus aria-hidden="true" size={16} /> Add zone
            </DashboardActionButton>
          </div>

          <div className="mt-5 rounded-2xl border border-dashed border-midnight/15 bg-[#f8faf7] p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-midnight/50">
              Pune-focused · not a map
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {DEMO_COVERAGE_ZONES.map((zone, index) => (
                <div
                  key={zone}
                  className="flex min-h-12 min-w-0 items-center gap-3 rounded-xl border border-midnight/8 bg-white px-3 py-2.5"
                >
                  <span
                    aria-hidden="true"
                    className={`grid size-7 shrink-0 place-items-center rounded-full text-[0.6rem] font-semibold ${draftAreas.includes(zone) ? 'bg-lime text-midnight' : 'bg-midnight/[0.05] text-midnight/50'}`}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 break-words text-xs font-medium text-midnight/75">
                    {zone}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-midnight/55">
              Cluster names are fictional UI placeholders and do not define real coverage or travel
              distances.
            </p>
          </div>
        </DashboardCard>

        <DashboardCard
          title="Selected demo zones"
          description="Remove zones to update this draft, then save it to the local dashboard session."
          icon={MapPinned}
        >
          {draftAreas.length === 0 ? (
            <DashboardEmptyState
              icon={MapPinned}
              title="No sample zones selected"
              description="Add a broad Pune demo zone above. The empty state is only an interface example, and no customer location is needed."
            />
          ) : (
            <ul className="grid gap-3">
              {draftAreas.map((zone, index) => (
                <li
                  key={zone}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-midnight/10 bg-[#f8faf7] p-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-midnight shadow-sm">
                      <MapPinned aria-hidden="true" size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-midnight">{zone}</p>
                      <p className="mt-1 text-xs text-midnight/55">
                        Sample zone {index + 1} · not a service promise
                      </p>
                    </div>
                  </div>
                  <DashboardActionButton
                    variant="quiet"
                    className="size-11 shrink-0 px-0 text-[#943329]"
                    aria-label={`Remove ${zone}`}
                    onClick={() => removeZone(zone)}
                  >
                    <Trash2 aria-hidden="true" size={17} />
                  </DashboardActionButton>
                </li>
              ))}
            </ul>
          )}

          {feedback ? (
            <p
              role="status"
              aria-live="polite"
              className="mt-4 rounded-xl bg-[#eef7e5] px-4 py-3 text-sm text-midnight"
            >
              {feedback}
            </p>
          ) : null}

          <div className="mt-5 flex flex-col-reverse gap-2 border-t border-midnight/8 pt-4 sm:flex-row sm:justify-end">
            <DashboardActionButton variant="secondary" onClick={resetChanges}>
              <RotateCcw aria-hidden="true" size={15} /> Reset changes
            </DashboardActionButton>
            <DashboardActionButton variant="primary" onClick={saveZones}>
              Save coverage zones
            </DashboardActionButton>
          </div>
        </DashboardCard>
      </div>

      <p className="mt-5 text-xs leading-5 text-midnight/55">
        This coverage editor stores only broad sample labels in client-side state. It does not
        request device location, postcode, customer address, or routing information. The initial
        fictional zones ({DEMO_TECHNICIAN_COVERAGE_AREAS.join(' and ')}) are placeholders, not
        claims about real technician service.
      </p>
    </>
  );
}
