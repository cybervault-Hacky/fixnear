import { Sparkles } from 'lucide-react';

export function TechnicianDemoNotice() {
  return (
    <aside
      role="note"
      className="mb-7 flex items-start gap-3 rounded-2xl border border-[#b8e986]/80 bg-[#f1f8e9] px-4 py-3.5 sm:mb-8 sm:px-5"
    >
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-lime text-midnight">
        <Sparkles aria-hidden="true" size={16} />
      </span>
      <div>
        <p className="text-sm font-semibold text-midnight">
          Technician dashboard · demonstration only
        </p>
        <p className="mt-1 text-xs leading-5 text-midnight/65 sm:text-sm sm:leading-6">
          Profile details, selected skills, broad Pune zones, availability, work history, statuses
          and rupee figures are fictional examples. Nothing is registered, verified, assigned, paid,
          or sent to a server; changes last only in this browser session.
        </p>
      </div>
    </aside>
  );
}
