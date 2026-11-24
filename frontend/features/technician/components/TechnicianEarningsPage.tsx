import { ArrowUpRight, Banknote, ChartColumnIncreasing, ClipboardList } from 'lucide-react';
import Link from 'next/link';

import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardEmptyState } from '@/features/dashboard/components/DashboardEmptyState';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import {
  DEMO_EARNINGS_TRANSACTIONS,
  DEMO_MONTHLY_VALUES,
  formatDemoRupees,
  formatTechnicianDemoDate,
  sumDemoTransactionValues,
} from '@/features/technician/data/demo-data';

const inlineLinkClassName =
  'inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-midnight/70 transition-colors hover:bg-midnight/[0.04] hover:text-midnight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight motion-reduce:transition-none';

export function TechnicianEarningsPage() {
  const sampleTotal = sumDemoTransactionValues(DEMO_EARNINGS_TRANSACTIONS);
  const maxMonthlyAmount = Math.max(...DEMO_MONTHLY_VALUES.map(({ amount }) => amount), 1);
  const chartDescription = DEMO_MONTHLY_VALUES.map(
    ({ month, amount }) => `${month}: ${formatDemoRupees(amount)}`,
  ).join('; ');

  return (
    <>
      <DashboardPageHeader
        eyebrow="Earnings overview · entirely fictional figures"
        title="Illustrative values, never a payout balance."
        description="Explore a sample completed-job total, transaction-style rows and a simple monthly chart. None of these figures is a real earning, amount due, payment or bank balance."
      />

      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <article className="min-w-0 rounded-2xl bg-midnight p-5 text-white shadow-[0_12px_36px_rgba(16,24,39,0.12)] sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-white/65">Example completed-job amounts</p>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-lime">
              <Banknote aria-hidden="true" size={19} />
            </span>
          </div>
          <p className="mt-4 break-words text-3xl font-semibold tracking-tight sm:text-4xl">
            {formatDemoRupees(sampleTotal)}
          </p>
          <p className="mt-2 text-xs leading-5 text-white/65">
            Computed from {DEMO_EARNINGS_TRANSACTIONS.length} fictional rows below · not actual
            earnings or payment.
          </p>
        </article>

        <article className="min-w-0 rounded-2xl border border-midnight/10 bg-white p-5 shadow-[0_8px_30px_rgba(16,24,39,0.025)] sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-midnight/50">
            Payment status
          </p>
          <p className="mt-3 text-lg font-semibold text-midnight">Not connected in this preview</p>
          <p className="mt-2 text-sm leading-6 text-midnight/60">
            There are no payment gateways, payout accounts, withdrawals, balances or banking
            workflows here.
          </p>
          <Link className={`${inlineLinkClassName} mt-2 -ml-2`} href="/technician/jobs">
            See sample work history <ArrowUpRight aria-hidden="true" size={14} />
          </Link>
        </article>
      </div>

      <div className="mt-5 grid min-w-0 items-start gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <DashboardCard
          title="Illustrative monthly chart"
          description="Example job values grouped by sample month; zero months are part of the fictional chart, not missing real records."
          icon={ChartColumnIncreasing}
        >
          <figure>
            <div
              role="img"
              aria-label={`Fictional monthly completed-job values in Indian rupees. ${chartDescription}. These amounts are not earnings or payouts.`}
              className="grid min-w-0 grid-cols-6 gap-2 rounded-2xl border border-midnight/8 bg-[#f8faf7] px-2 py-4 sm:gap-3 sm:px-4"
            >
              {DEMO_MONTHLY_VALUES.map(({ month, amount }) => {
                const height = Math.round((amount / maxMonthlyAmount) * 100);
                const compactAmount = amount === 0 ? '₹0' : `₹${(amount / 1000).toFixed(2)}k`;

                return (
                  <div
                    key={month}
                    className="grid min-w-0 grid-rows-[auto_116px_auto] justify-items-center gap-2"
                  >
                    <span className="max-w-full break-all text-center text-[0.58rem] font-medium leading-4 text-midnight/60 sm:text-[0.65rem]">
                      {compactAmount}
                    </span>
                    <div className="flex h-full w-full max-w-10 items-end justify-center rounded-t-lg bg-midnight/[0.04]">
                      <span
                        aria-hidden="true"
                        className="block w-full rounded-t-lg bg-lime"
                        style={{ height: `${height}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-midnight/60">{month}</span>
                  </div>
                );
              })}
            </div>
            <figcaption className="mt-3 text-xs leading-5 text-midnight/55">
              The chart summarizes sample job amounts only. It is not a financial statement or
              evidence of payment.
            </figcaption>
          </figure>
        </DashboardCard>

        <DashboardCard
          title="Example transaction history"
          description="Read-only fictional rows based on the work-history examples."
          icon={ClipboardList}
        >
          <DashboardEmptyState
            compact
            icon={Banknote}
            title="No live earnings or payments are connected"
            description="Every row below is demonstration data. No money has been earned, collected or transferred by this UI."
          />
          <ol className="mt-4 grid gap-3">
            {DEMO_EARNINGS_TRANSACTIONS.map((transaction) => (
              <li
                key={transaction.id}
                className="flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-xl border border-midnight/10 bg-white p-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-midnight">
                    {transaction.service}
                  </p>
                  <p className="mt-1 break-words text-xs leading-5 text-midnight/55">
                    {formatTechnicianDemoDate(transaction.date)} · {transaction.reference}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-midnight">
                    {formatDemoRupees(transaction.amount)}
                  </p>
                  <p className="mt-1 text-[0.65rem] text-midnight/50">Example only</p>
                </div>
              </li>
            ))}
          </ol>
        </DashboardCard>
      </div>

      <aside
        role="note"
        className="mt-5 rounded-2xl border border-[#e7d8bf] bg-[#fff9ef] p-5 sm:p-6"
      >
        <h2 className="text-sm font-semibold text-midnight">
          Important: these are not earnings or payout records
        </h2>
        <p className="mt-2 max-w-4xl text-xs leading-5 text-midnight/65 sm:text-sm sm:leading-6">
          Every rupee amount is fictional and exists only to illustrate the interface. It does not
          represent real work, an amount owed, a completed transaction, tax information, a payment
          balance, or a bank or payment-provider record. No payment gateway, payout, withdrawal or
          banking connection is implemented.
        </p>
      </aside>
    </>
  );
}
