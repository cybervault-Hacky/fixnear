'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { LoaderCircle, Pencil, Star, X } from 'lucide-react';

import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { LoadingNotice, Notice } from '@/features/bookings/components/booking-ui';
import { FixNearApiError } from '@/lib/api/client';
import { createReview, listEligibleBookings, listMyReviews, updateReview } from '@/lib/api/reviews';
import type { EligibleBooking, Review, ReviewInput } from '@/lib/api/reviews';

const EDIT_WINDOW_DAYS = 30;

function Stars({ rating, onChange }: { rating: number; onChange?: (value: number) => void }) {
  return (
    <span
      role={onChange ? 'radiogroup' : 'img'}
      aria-label={`${rating} out of 5 stars`}
      className="inline-flex items-center gap-1"
    >
      {[1, 2, 3, 4, 5].map((value) => {
        const filled = value <= rating;
        const star = (
          <Star
            size={onChange ? 28 : 16}
            aria-hidden="true"
            className={filled ? 'fill-[#d9a521] text-[#d9a521]' : 'text-midnight/20'}
          />
        );
        return onChange ? (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} star${value === 1 ? '' : 's'}`}
            onClick={() => onChange(value)}
            className="rounded-lg p-0.5 focus-visible:outline-2 focus-visible:outline-midnight"
          >
            {star}
          </button>
        ) : (
          <span key={value}>{star}</span>
        );
      })}
    </span>
  );
}

function canEdit(review: Review): boolean {
  const created = new Date(review.created_at).getTime();
  return Number.isFinite(created) && Date.now() - created < EDIT_WINDOW_DAYS * 24 * 3600 * 1000;
}

const SUBRATING_FIELDS = [
  { key: 'service_quality', label: 'Service quality' },
  { key: 'professionalism', label: 'Professionalism' },
  { key: 'timeliness', label: 'Timeliness' },
  { key: 'communication', label: 'Communication' },
] as const;

export function CustomerReviewsPage() {
  const [eligible, setEligible] = useState<EligibleBooking[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const [composeFor, setComposeFor] = useState<EligibleBooking | null>(null);
  const [editing, setEditing] = useState<Review | null>(null);
  const [rating, setRating] = useState(0);
  const [subRatings, setSubRatings] = useState<Record<string, number | null>>({});
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [formMessage, setFormMessage] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setLoadError('');
    Promise.all([listEligibleBookings(), listMyReviews()])
      .then(([eligibleResult, reviewsResult]) => {
        setEligible(eligibleResult.items);
        setReviews(reviewsResult.items);
      })
      .catch((error: unknown) => {
        if (error instanceof FixNearApiError && (error.status === 401 || error.status === 403)) {
          setForbidden(true);
          setLoadError('Sign in with your FixNear account to see and write reviews.');
          return;
        }
        setLoadError(
          error instanceof FixNearApiError ? error.message : 'Reviews could not be loaded.',
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setComposeFor(null);
    setEditing(null);
    setRating(0);
    setSubRatings({});
    setFeedback('');
    setFormError('');
  };

  const beginCompose = (booking: EligibleBooking) => {
    setComposeFor(booking);
    setEditing(null);
    setRating(0);
    setSubRatings({});
    setFeedback('');
    setFormError('');
    setFormMessage('');
  };

  const beginEdit = (review: Review) => {
    setEditing(review);
    setComposeFor(null);
    setRating(review.rating);
    setSubRatings({
      service_quality: review.service_quality,
      professionalism: review.professionalism,
      timeliness: review.timeliness,
      communication: review.communication,
    });
    setFeedback(review.feedback);
    setFormError('');
    setFormMessage('');
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (rating < 1) {
      setFormError('Select a star rating before submitting.');
      return;
    }
    const trimmedFeedback = feedback.trim();
    if (trimmedFeedback.length < 10) {
      setFormError('Write at least 10 characters of feedback.');
      return;
    }
    const input: ReviewInput = {
      rating,
      service_quality: subRatings.service_quality ?? null,
      professionalism: subRatings.professionalism ?? null,
      timeliness: subRatings.timeliness ?? null,
      communication: subRatings.communication ?? null,
      feedback: trimmedFeedback,
    };
    setBusy(true);
    setFormError('');
    const action = editing
      ? updateReview(editing.id, input)
      : composeFor
        ? createReview(composeFor.booking_id, input)
        : null;
    if (!action) {
      setBusy(false);
      return;
    }
    action
      .then(() => {
        setFormMessage(
          editing ? 'Your review was updated.' : 'Thank you! Your review was submitted.',
        );
        resetForm();
        load();
      })
      .catch((error: unknown) =>
        setFormError(
          error instanceof FixNearApiError ? error.message : 'The review could not be saved.',
        ),
      )
      .finally(() => setBusy(false));
  };

  const formOpen = composeFor !== null || editing !== null;
  const sortedReviews = useMemo(
    () => [...reviews].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [reviews],
  );

  return (
    <>
      <DashboardPageHeader
        eyebrow="Feedback"
        title="My reviews"
        description="Review completed jobs. Reviews can be edited within 30 days of posting. Only completed bookings with an assigned technician that have not been reviewed yet are eligible."
      />

      {formMessage ? <Notice kind="success">{formMessage}</Notice> : null}
      {loadError ? (
        <div className="mt-2">
          <Notice kind="error">{loadError}</Notice>
        </div>
      ) : null}
      {loading ? (
        <div className="mt-4">
          <LoadingNotice label="Loading your reviews…" />
        </div>
      ) : null}

      {!loading && !forbidden ? (
        <div className="mt-5 grid items-start gap-5 xl:grid-cols-2">
          <DashboardCard
            title="Awaiting your review"
            description="Completed jobs eligible for a review."
            icon={Star}
          >
            {eligible.length === 0 ? (
              <p className="text-sm text-midnight/55">
                Nothing to review right now. Reviews unlock after a job is completed and a
                technician was assigned.
              </p>
            ) : (
              <ul className="grid gap-3">
                {eligible.map((booking) => (
                  <li
                    key={booking.booking_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-midnight/10 bg-[#f8faf7] p-3"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-midnight">
                        {booking.service_slug.replaceAll('-', ' ')}
                      </span>
                      <span className="block text-xs text-midnight/55">
                        {booking.technician_display_name} ·{' '}
                        {new Date(booking.preferred_date).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => beginCompose(booking)}
                      className="inline-flex min-h-9 items-center rounded-xl bg-midnight px-4 text-xs font-semibold text-white focus-visible:outline-2 focus-visible:outline-midnight"
                    >
                      Write review
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </DashboardCard>

          <div className="grid gap-5">
            {formOpen ? (
              <DashboardCard
                title={
                  editing
                    ? 'Edit your review'
                    : `Review ${composeFor?.technician_display_name ?? ''}`
                }
                description={
                  editing
                    ? `You can edit within ${EDIT_WINDOW_DAYS} days of posting.`
                    : 'Share honest feedback. Do not include personal contact details.'
                }
                icon={Pencil}
                action={
                  <button
                    type="button"
                    onClick={resetForm}
                    aria-label="Close form"
                    className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-midnight/15"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                }
              >
                <form onSubmit={submit} className="grid gap-3">
                  {formError ? <Notice kind="error">{formError}</Notice> : null}
                  <fieldset>
                    <legend className="text-xs font-semibold text-midnight">Overall rating</legend>
                    <div className="mt-1">
                      <Stars rating={rating} onChange={setRating} />
                    </div>
                  </fieldset>
                  <fieldset className="grid gap-2 sm:grid-cols-2">
                    {SUBRATING_FIELDS.map((field) => (
                      <label key={field.key} className="text-xs font-semibold text-midnight">
                        {field.label}
                        <select
                          value={subRatings[field.key] ?? ''}
                          onChange={(event) =>
                            setSubRatings((current) => ({
                              ...current,
                              [field.key]:
                                event.target.value === '' ? null : Number(event.target.value),
                            }))
                          }
                          className="mt-1 min-h-10 w-full rounded-xl border border-midnight/15 bg-white px-2 text-xs focus-visible:outline-2 focus-visible:outline-midnight"
                        >
                          <option value="">Not rated</option>
                          {[5, 4, 3, 2, 1].map((value) => (
                            <option key={value} value={value}>
                              {value} —{' '}
                              {value === 5
                                ? 'Excellent'
                                : value === 4
                                  ? 'Good'
                                  : value === 3
                                    ? 'Average'
                                    : value === 2
                                      ? 'Poor'
                                      : 'Bad'}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </fieldset>
                  <label className="text-xs font-semibold text-midnight">
                    Detailed feedback
                    <textarea
                      required
                      minLength={10}
                      rows={4}
                      value={feedback}
                      onChange={(event) => setFeedback(event.target.value)}
                      placeholder="What was done well, what could improve?"
                      className="mt-1 w-full rounded-xl border border-midnight/15 p-3 text-sm focus-visible:outline-2 focus-visible:outline-midnight"
                    />
                  </label>
                  <div>
                    <button
                      type="submit"
                      disabled={busy}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-midnight px-5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {busy ? (
                        <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                      ) : null}
                      {editing ? 'Save changes' : 'Submit review'}
                    </button>
                  </div>
                </form>
              </DashboardCard>
            ) : null}

            <DashboardCard
              title="Submitted reviews"
              description="Visible to the technician once published."
              icon={Star}
            >
              {sortedReviews.length === 0 ? (
                <p className="text-sm text-midnight/55">You have not submitted any reviews yet.</p>
              ) : (
                <ul className="grid gap-3">
                  {sortedReviews.map((review) => (
                    <li
                      key={review.id}
                      className="rounded-2xl border border-midnight/10 bg-white p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-xs font-semibold text-midnight">
                          <Stars rating={review.rating} />
                          {review.technician_display_name}
                        </span>
                        <span className="text-[0.65rem] uppercase tracking-wide text-midnight/45">
                          {review.status === 'hidden'
                            ? 'Hidden by moderation'
                            : review.edited
                              ? 'Edited'
                              : 'Published'}
                          {' · '}
                          {new Date(review.created_at).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-midnight/85">{review.feedback}</p>
                      {review.status === 'published' && canEdit(review) ? (
                        <button
                          type="button"
                          onClick={() => beginEdit(review)}
                          className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-midnight/15 px-3 text-[0.7rem] font-semibold text-midnight hover:bg-[#f4f6f8]"
                        >
                          <Pencil size={12} aria-hidden="true" /> Edit
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </DashboardCard>
          </div>
        </div>
      ) : null}
    </>
  );
}
