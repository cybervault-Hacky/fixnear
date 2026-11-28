'use client';

import { useCallback, useEffect, useState } from 'react';
import { Star, Wrench } from 'lucide-react';

import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { LoadingNotice, Notice } from '@/features/bookings/components/booking-ui';
import { FixNearApiError } from '@/lib/api/client';
import { getTechnicianRatingSummary, listReceivedReviews } from '@/lib/api/reviews';
import type { Review } from '@/lib/api/reviews';

function Stars({ rating }: { rating: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          size={15}
          aria-hidden="true"
          className={value <= rating ? 'fill-[#d9a521] text-[#d9a521]' : 'text-midnight/20'}
        />
      ))}
    </span>
  );
}

export function TechnicianReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [publishedCount, setPublishedCount] = useState(0);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([listReceivedReviews(), getTechnicianRatingSummary()])
      .then(([listResult, summary]) => {
        setReviews(listResult.items);
        setPublishedCount(summary.published_review_count);
        setAverageRating(summary.average_rating);
      })
      .catch((requestError: unknown) => {
        if (
          requestError instanceof FixNearApiError &&
          (requestError.status === 401 || requestError.status === 403)
        ) {
          setForbidden(true);
          setError('This area requires a verified FixNear technician account.');
          return;
        }
        setError(
          requestError instanceof FixNearApiError
            ? requestError.message
            : 'Reviews could not be loaded.',
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = reviews.filter((review) => review.status === 'published');

  return (
    <>
      <DashboardPageHeader
        eyebrow="Technician"
        title="Customer reviews"
        description="Feedback from customers whose jobs you completed. Only published reviews are shown; moderation decisions are handled by FixNear admins."
      />

      {loading ? <LoadingNotice label="Loading your reviews…" /> : null}
      {error ? <Notice kind="error">{error}</Notice> : null}

      {!loading && !forbidden ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            <div className="rounded-2xl border border-midnight/10 bg-white p-4 text-center">
              <p className="text-3xl font-semibold tracking-tight text-midnight">
                {averageRating === null ? '—' : averageRating.toFixed(1)}
              </p>
              <p className="mt-1 text-xs text-midnight/55">Average rating</p>
            </div>
            <div className="rounded-2xl border border-midnight/10 bg-white p-4 text-center">
              <p className="text-3xl font-semibold tracking-tight text-midnight">
                {publishedCount}
              </p>
              <p className="mt-1 text-xs text-midnight/55">Published reviews</p>
            </div>
          </div>

          <DashboardCard
            title="Recent feedback"
            description="Sorted newest first."
            icon={Wrench}
            className="mt-5"
          >
            {visible.length === 0 ? (
              <p className="text-sm text-midnight/55">
                No published reviews yet. They appear here after customers rate completed jobs.
              </p>
            ) : (
              <ul className="grid gap-3">
                {visible.map((review) => (
                  <li
                    key={review.id}
                    className="rounded-2xl border border-midnight/10 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Stars rating={review.rating} />
                      <span className="text-[0.7rem] tabular-nums text-midnight/50">
                        {new Date(review.created_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-midnight/85">{review.feedback}</p>
                    <p className="mt-2 text-[0.65rem] uppercase tracking-wide text-midnight/45">
                      {review.customer_label} ·{' '}
                      {review.service_slug?.replaceAll('-', ' ') ?? 'Service'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </DashboardCard>
        </>
      ) : null}
    </>
  );
}
