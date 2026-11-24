import { ClipboardList, ShieldCheck } from 'lucide-react';

export function TechnicianBookingNotice() {
  return (
    <aside
      role="note"
      className="mb-7 flex items-start gap-3 rounded-2xl border border-[#b8e986]/80 bg-[#f1f8e9] px-4 py-3.5 sm:mb-8 sm:px-5"
    >
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-lime text-midnight">
        <ClipboardList aria-hidden="true" size={16} />
      </span>
      <div>
        <p className="text-sm font-semibold text-midnight">
          Private database-backed bookings and PriceLock tools
        </p>
        <p className="mt-1 text-xs leading-5 text-midnight/65 sm:text-sm sm:leading-6">
          The API returns only bookings assigned to the authenticated technician. Accept or decline
          an assignment, record an inspection, and prepare itemized quote versions. Preferred
          customer windows are not availability guarantees; paid work cannot start until the
          customer approves the current quote. This interface does not collect payments.
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
