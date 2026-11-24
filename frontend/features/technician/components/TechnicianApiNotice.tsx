import { Database, ShieldCheck } from 'lucide-react';

export function TechnicianApiNotice() {
  return (
    <aside
      role="note"
      className="mb-7 flex items-start gap-3 rounded-2xl border border-[#b8e986]/80 bg-[#f1f8e9] px-4 py-3.5 sm:mb-8 sm:px-5"
    >
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-lime text-midnight">
        <Database aria-hidden="true" size={16} />
      </span>
      <div>
        <p className="text-sm font-semibold text-midnight">Database-backed technician tools</p>
        <p className="mt-1 text-xs leading-5 text-midnight/65 sm:text-sm sm:leading-6">
          Profile, skills, service areas and weekly availability preferences are read and saved only
          through the authenticated technician API. Availability is a preference, not a live slot;
          registration does not verify a technician, and only an authorized admin can review a
          submission. No booking, payment or identity-document upload is part of this page.
        </p>
      </div>
      <ShieldCheck
        aria-hidden="true"
        className="mt-1 hidden shrink-0 text-midnight/45 sm:block"
        size={18}
      />
    </aside>
  );
}
