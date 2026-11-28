'use client';

import { useEffect, useState } from 'react';

import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { apiRequest } from '@/lib/api/client';

type Draft = { id: string; quote_version: number; amount_paise: number; currency: string };
type Attempt = { id: string; provider_reference: string; state: string };
type Row = { draft: Draft; attempts: Attempt[] };

const statuses: Record<string, string> = {
  pending_verification: 'Pending verification',
  verified_success_simulation: 'Verified simulated success — not captured or settled',
  verified_failure_simulation: 'Verified simulated failure',
  verified_cancelled_simulation: 'Verified simulated cancellation',
  verified_expired_simulation: 'Verified simulated expiration',
};

export function SimulatedPaymentStatus() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void apiRequest<Draft[]>('customer/simulated-payments')
      .then(async (drafts) =>
        Promise.all(
          drafts.map(async (draft) => ({
            draft,
            attempts: await apiRequest<Attempt[]>(
              `customer/simulated-payments/${draft.id}/attempts`,
            ),
          })),
        ),
      )
      .then((result) => {
        if (active) setRows(result);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);

  return (
    <section className="space-y-6">
      <DashboardPageHeader
        eyebrow="SIMULATED · no real payment"
        title="Simulated payment status"
        description="These are test notifications only. No payment is captured, settled or transferred."
      />
      {loading && <p role="status">Loading simulated status…</p>}
      {error && (
        <div role="alert">
          <p>Unable to load simulated status.</p>
          <button type="button" onClick={() => setRetry((n) => n + 1)} className="underline">
            Try again
          </button>
        </div>
      )}
      {!loading && !error && rows.length === 0 && <p>No simulated payment drafts yet.</p>}
      {!loading &&
        !error &&
        rows.map(({ draft, attempts }) => (
          <article key={draft.id} className="rounded-2xl border border-midnight/10 bg-white p-5">
            <h2 className="font-semibold">SIMULATED · Quote version {draft.quote_version}</h2>
            <p>
              {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
                draft.amount_paise / 100,
              )}
            </p>
            {attempts.length === 0 ? (
              <p>Draft only — no attempt.</p>
            ) : (
              attempts.map((attempt) => (
                <div key={attempt.id} className="mt-3 break-all">
                  <p>{statuses[attempt.state] ?? 'Status unavailable'}</p>
                  <p>Reference: {attempt.provider_reference}</p>
                </div>
              ))
            )}
          </article>
        ))}
    </section>
  );
}
