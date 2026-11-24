import type { TechnicianJobStatus } from '@/features/technician/types/technician';

type TechnicianJobStatusBadgeProps = {
  status: TechnicianJobStatus;
};

export function TechnicianJobStatusBadge({ status }: TechnicianJobStatusBadgeProps) {
  const isCompleted = status === 'Completed';

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[0.65rem] font-semibold ${isCompleted ? 'bg-[#edf6e4] text-midnight' : 'bg-[#f4f1ef] text-midnight/65'}`}
    >
      {status} · demo
    </span>
  );
}
