import { Sparkles } from 'lucide-react';

export function DemoDataNotice() {
  return (
    <aside
      role="note"
      className="mb-7 flex items-start gap-3 rounded-2xl border border-[#b8e986]/80 bg-[#f1f8e9] px-4 py-3.5 sm:mb-8 sm:px-5"
    >
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-lime text-midnight">
        <Sparkles aria-hidden="true" size={16} />
      </span>
      <div>
        <p className="text-sm font-semibold text-midnight">Demonstration workspace</p>
        <p className="mt-1 text-xs leading-5 text-midnight/65 sm:text-sm sm:leading-6">
          Names, addresses, activity, appliances and warranty details are examples only—not real
          customer records. Edits stay in this dashboard session and are not sent to an account.
        </p>
      </div>
    </aside>
  );
}
