import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import type {
  BookingDetail,
  BookingEvent,
  BookingList,
  BookingQuote,
  BookingStatus,
  BookingSummary,
  BookingVisit,
  QuoteLineType,
} from '../lib/api/bookings';

const BOOKING_ID = 'a3000000-0000-4000-8000-000000000001';
const SERVICE_ID = 'a3000000-0000-4000-8000-000000000002';
const CUSTOMER_ID = 'a3000000-0000-4000-8000-000000000003';
const TECHNICIAN_ID = 'a3000000-0000-4000-8000-000000000004';
const ADMIN_ID = 'a3000000-0000-4000-8000-000000000005';
const QUOTE_V1_ID = 'a3000000-0000-4000-8000-000000000006';
const QUOTE_V2_ID = 'a3000000-0000-4000-8000-000000000007';
const VISIT_ID = 'a3000000-0000-4000-8000-000000000008';

const TEST_ADDRESS: NonNullable<BookingDetail['address']> = {
  label: 'Fictional test home',
  recipient_name: 'Fixture Customer',
  address_line1: '1 Imaginary Orchid Lane',
  address_line2: 'Unit 0',
  locality: 'Demo Colony',
  city: 'Pune',
  state: 'Maharashtra',
  postal_code: '000000',
  contact_phone: null,
  latitude: null,
  longitude: null,
  location_accuracy_meters: null,
};

const service = {
  id: SERVICE_ID,
  slug: 'ac-repair',
  title: 'AC Repair',
  home_title: 'Air conditioner',
  home_description: 'Cooling problems',
  description: 'A fixture-only service guide for booking workflow verification.',
  listing_description: 'Fixture only; no live provider or price information.',
  category: {
    id: 'a3000000-0000-4000-8000-000000000009',
    slug: 'appliance-repair',
    title: 'Appliance repair',
    description: 'Fixture category.',
    display_order: 0,
  },
  keywords: ['cooling'],
  common_problems: [],
  inspection_scope: [],
  questions: [],
  related_service_slugs: [],
  display_order: 0,
};

function nowIso() {
  return new Date().toISOString();
}

function makeEvent(
  eventType: string,
  sequence: number,
  options: {
    actor?: string | null;
    target?: string | null;
    fromStatus?: string | null;
    toStatus?: string | null;
    note?: string | null;
    isInternal?: boolean;
  } = {},
): BookingEvent {
  return {
    id: `fixture-event-${sequence}`,
    sequence,
    event_type: eventType,
    actor_user_id: options.actor ?? null,
    target_user_id: options.target ?? null,
    from_status: options.fromStatus ?? null,
    to_status: options.toStatus ?? null,
    reference_id: null,
    note: options.note ?? null,
    is_internal: options.isInternal ?? false,
    created_at: nowIso(),
  };
}

function appendEvent(
  booking: BookingDetail,
  eventType: string,
  options: Parameters<typeof makeEvent>[2] = {},
): BookingEvent[] {
  const sequence = Math.max(0, ...booking.events.map((event) => event.sequence)) + 1;
  return [...booking.events, makeEvent(eventType, sequence, options)];
}

function makeQuote(
  options: {
    id?: string;
    version?: number;
    status?: BookingQuote['status'];
    isCurrent?: boolean;
    description?: string;
    lineType?: QuoteLineType;
    unitAmountPaise?: number;
    quantity?: number;
    expiresAt?: string;
    decisionNote?: string | null;
  } = {},
): BookingQuote {
  const id = options.id ?? QUOTE_V1_ID;
  const version = options.version ?? 1;
  const status = options.status ?? 'pending';
  const quantity = options.quantity ?? 1;
  const unitAmountPaise = options.unitAmountPaise ?? 85_000;
  const decided = status === 'approved' || status === 'rejected';
  return {
    id,
    version,
    status,
    is_current: options.isCurrent ?? true,
    currency: 'INR',
    total_paise: quantity * unitAmountPaise,
    technician_notes: 'Fixture quotation only; no payment is collected.',
    issued_at: nowIso(),
    expires_at: options.expiresAt ?? '2030-01-01T12:00:00.000Z',
    is_expired: false,
    created_by_user_id: TECHNICIAN_ID,
    decision_by_user_id: decided ? CUSTOMER_ID : null,
    decided_at: decided ? nowIso() : null,
    decision_note: options.decisionNote ?? null,
    line_items: [
      {
        id: `fixture-quote-${version}-line-1`,
        position: 1,
        line_type: options.lineType ?? 'inspection',
        description: options.description ?? 'Fixture inspection line',
        quantity,
        unit_amount_paise: unitAmountPaise,
        line_total_paise: quantity * unitAmountPaise,
      },
    ],
  };
}

function makeBooking(
  options: {
    status?: BookingStatus;
    address?: BookingDetail['address'];
    assigned?: boolean;
    quotes?: BookingQuote[];
    visit?: BookingVisit | null;
    events?: BookingEvent[];
    version?: number;
  } = {},
): BookingDetail {
  const status = options.status ?? 'requested';
  const address = options.address === undefined ? TEST_ADDRESS : options.address;
  const assigned = options.assigned ?? !['requested', 'cancelled'].includes(status);
  const quotes = options.quotes ?? [];
  const currentQuote = quotes.find((quote) => quote.is_current) ?? null;
  const createdAt = new Date(Date.now() - 60_000).toISOString();
  return {
    id: BOOKING_ID,
    service_slug: 'ac-repair',
    service_title: 'AC Repair',
    status,
    preferred_date: '2026-12-02',
    preferred_start: '09:00:00',
    preferred_end: '12:00:00',
    timezone_name: 'Asia/Kolkata',
    address_locality: address?.locality ?? null,
    city: address?.city ?? null,
    assigned_technician_user_id: assigned ? TECHNICIAN_ID : null,
    assigned_technician_name: assigned ? 'Fixture Technician' : null,
    current_quote_total_paise: currentQuote?.total_paise ?? null,
    current_quote_status: currentQuote?.status ?? null,
    escalation_status: 'normal',
    created_at: createdAt,
    updated_at: createdAt,
    version: options.version ?? 1,
    customer_user_id: CUSTOMER_ID,
    customer_display_name: 'Fixture Customer',
    service_id: SERVICE_ID,
    address,
    location_access_limited: address === null,
    problem_description:
      'Fixture-only report: the demonstration air conditioner is not cooling consistently.',
    cancellation_reason: null,
    escalation_reason: null,
    visit: options.visit ?? null,
    quotes,
    events: options.events ?? [makeEvent('booking.created', 1, { actor: CUSTOMER_ID })],
  };
}

function summaryFrom(booking: BookingDetail): BookingSummary {
  return {
    id: booking.id,
    service_slug: booking.service_slug,
    service_title: booking.service_title,
    status: booking.status,
    preferred_date: booking.preferred_date,
    preferred_start: booking.preferred_start,
    preferred_end: booking.preferred_end,
    timezone_name: booking.timezone_name,
    address_locality: booking.address_locality,
    city: booking.city,
    assigned_technician_user_id: booking.assigned_technician_user_id,
    assigned_technician_name: booking.assigned_technician_name,
    current_quote_total_paise: booking.current_quote_total_paise,
    current_quote_status: booking.current_quote_status,
    escalation_status: booking.escalation_status,
    created_at: booking.created_at,
    updated_at: booking.updated_at,
    version: booking.version,
  };
}

function bookingList(booking: BookingDetail): BookingList {
  return { items: [summaryFrom(booking)], total: 1 };
}

function customerView(booking: BookingDetail): BookingDetail {
  return { ...booking, events: booking.events.filter((event) => !event.is_internal) };
}

function technicianView(booking: BookingDetail): BookingDetail {
  if (booking.status === 'assigned') {
    return {
      ...booking,
      address: null,
      location_access_limited: true,
      events: booking.events.filter((event) => !event.is_internal),
    };
  }
  return { ...booking, events: booking.events.filter((event) => !event.is_internal) };
}

async function fulfillJson(route: Route, json: unknown, status = 200) {
  await route.fulfill({ status, json });
}

function mutationRecord(route: Route) {
  const request = route.request();
  return {
    method: request.method(),
    path: new URL(request.url()).pathname,
    body: request.postDataJSON() as Record<string, unknown>,
    headers: request.headers(),
  };
}

function watchBrowser(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedApiRequests: string[] = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    const text = message.text();
    const expectedAuthFailure =
      /^Failed to load resource: the server responded with a status of 40[13] \((Unauthorized|Forbidden)\)$/.test(
        text,
      );
    if (message.type() === 'error' && !expectedAuthFailure) consoleErrors.push(text);
  });
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/backend/v1/')) {
      failedApiRequests.push(
        `${request.method()} ${url.pathname}: ${request.failure()?.errorText}`,
      );
    }
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/backend/v1/') && response.status() >= 500) {
      failedApiRequests.push(`${response.status()} ${url.pathname}`);
    }
  });

  return { pageErrors, consoleErrors, failedApiRequests };
}

function expectCleanBrowserAudit(audit: ReturnType<typeof watchBrowser>) {
  expect(audit.pageErrors, 'uncaught browser page errors').toEqual([]);
  expect(audit.consoleErrors, 'browser console errors').toEqual([]);
  expect(audit.failedApiRequests, 'failed or server-error booking API requests').toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const { viewportWidth, documentWidth, bodyWidth, overflowingElements } = await page.evaluate(
    () => ({
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      overflowingElements: Array.from(document.body.querySelectorAll('*'))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            id: element.id,
            className: typeof element.className === 'string' ? element.className : '',
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            text: element.textContent?.trim().replace(/\\s+/g, ' ').slice(0, 100) ?? '',
          };
        })
        .filter(
          (element) => element.width > 0 && (element.left < -1 || element.right > innerWidth + 1),
        )
        .slice(0, 12),
    }),
  );
  const diagnostics = JSON.stringify(overflowingElements);
  expect(
    documentWidth,
    `${label}: document width; overflowing elements: ${diagnostics}`,
  ).toBeLessThanOrEqual(viewportWidth + 1);
  expect(
    bodyWidth,
    `${label}: body width; overflowing elements: ${diagnostics}`,
  ).toBeLessThanOrEqual(viewportWidth + 1);
}

test('customer can submit a private service request, review its status and cancel it', async ({
  page,
}) => {
  const browserAudit = watchBrowser(page);
  await page.setViewportSize({ width: 390, height: 844 });
  let current = makeBooking({ status: 'requested', assigned: false });
  const createCalls: ReturnType<typeof mutationRecord>[] = [];
  const cancelCalls: ReturnType<typeof mutationRecord>[] = [];
  const unexpected: string[] = [];

  await page.route('**/api/backend/v1/**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (pathname === '/api/backend/v1/services' && request.method() === 'GET') {
      await fulfillJson(route, [service]);
      return;
    }
    if (pathname === '/api/backend/v1/customer/addresses' && request.method() === 'GET') {
      await fulfillJson(route, []);
      return;
    }
    if (pathname === '/api/backend/v1/customer/bookings' && request.method() === 'POST') {
      createCalls.push(mutationRecord(route));
      await fulfillJson(route, customerView(current), 201);
      return;
    }
    if (pathname === '/api/backend/v1/customer/bookings' && request.method() === 'GET') {
      await fulfillJson(route, bookingList(current));
      return;
    }
    if (
      pathname === `/api/backend/v1/customer/bookings/${BOOKING_ID}` &&
      request.method() === 'GET'
    ) {
      await fulfillJson(route, customerView(current));
      return;
    }
    if (
      pathname === `/api/backend/v1/customer/bookings/${BOOKING_ID}/cancel` &&
      request.method() === 'POST'
    ) {
      cancelCalls.push(mutationRecord(route));
      const body = request.postDataJSON() as { reason: string };
      current = {
        ...current,
        status: 'cancelled',
        cancellation_reason: body.reason,
        updated_at: nowIso(),
        version: current.version + 1,
        events: appendEvent(current, 'booking.cancelled', {
          actor: CUSTOMER_ID,
          fromStatus: current.status,
          toStatus: 'cancelled',
          note: body.reason,
        }),
      };
      await fulfillJson(route, customerView(current));
      return;
    }
    unexpected.push(`${request.method()} ${pathname}`);
    await fulfillJson(route, { detail: 'Unexpected test-only API request.' }, 500);
  });

  await page.goto('/bookings/new?service=ac-repair');
  await expect(page.getByLabel('Active service guide')).toHaveValue('ac-repair');
  await page
    .getByLabel('What is happening?')
    .fill('Fixture report: the air conditioner does not cool the demonstration room consistently.');
  await page.getByLabel('Address label').fill('Fictional test home');
  await page.getByLabel('Recipient name').fill('Fixture Customer');
  await page.getByLabel('Address line 1').fill(TEST_ADDRESS.address_line1);
  await page.getByLabel('Address line 2 · optional').fill(TEST_ADDRESS.address_line2 ?? '');
  await page.getByLabel('Locality / area').fill(TEST_ADDRESS.locality);
  await page.getByLabel('Postal code').fill(TEST_ADDRESS.postal_code);
  await page.locator('#preferred-date').fill('2026-12-02');
  await page.getByRole('button', { name: 'Submit service request' }).click();

  await expect(page).toHaveURL(new RegExp(`/bookings/${BOOKING_ID}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'AC Repair' })).toBeVisible();
  await expect(page.getByText('Request received', { exact: true })).toBeVisible();
  await expect(page.getByText(TEST_ADDRESS.address_line1)).toBeVisible();
  await expect(page.getByText('No PriceLock quotation has been issued.')).toBeVisible();
  await expectNoHorizontalOverflow(page, 'customer booking detail at 390 × 844');

  expect(createCalls).toHaveLength(1);
  expect(createCalls[0]?.path).toBe('/api/backend/v1/customer/bookings');
  expect(createCalls[0]?.headers['idempotency-key']).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  expect(createCalls[0]?.body).toMatchObject({
    service_slug: 'ac-repair',
    problem_description:
      'Fixture report: the air conditioner does not cool the demonstration room consistently.',
    preferred_date: '2026-12-02',
    preferred_start: '09:00',
    preferred_end: '12:00',
    timezone_name: 'Asia/Kolkata',
    new_address: {
      label: 'Fictional test home',
      recipient_name: 'Fixture Customer',
      address_line1: TEST_ADDRESS.address_line1,
      locality: TEST_ADDRESS.locality,
      postal_code: TEST_ADDRESS.postal_code,
    },
    save_new_address: false,
  });

  await page.getByLabel('Reason for cancellation').fill('Fixture cancellation request.');
  await page.getByRole('button', { name: 'Cancel service request' }).click();
  await expect(page.getByText('Request cancelled', { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText('Fixture cancellation request.', { exact: true }).first(),
  ).toBeVisible();
  expect(cancelCalls).toHaveLength(1);
  expect(cancelCalls[0]?.body).toEqual({ reason: 'Fixture cancellation request.' });
  expect(cancelCalls[0]?.headers['idempotency-key']).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  await expect(page.getByRole('heading', { name: 'Cancel this request' })).toHaveCount(0);

  await page.goto('/bookings');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Your service requests.' }),
  ).toBeVisible();
  await expect(page.getByText('Request cancelled', { exact: true }).first()).toBeVisible();
  await expect(page.locator('main')).not.toContainText(TEST_ADDRESS.address_line1);
  expect(unexpected).toEqual([]);
  expectCleanBrowserAudit(browserAudit);
});

test('customer rejects a quote with a reason, a technician revises it, and approval gates paid work', async ({
  page,
}) => {
  const browserAudit = watchBrowser(page);
  const firstQuote = makeQuote({
    description: 'Fixture inspection and diagnostics',
    unitAmountPaise: 85_000,
  });
  let current = makeBooking({
    status: 'quote_pending',
    quotes: [firstQuote],
    events: [
      makeEvent('booking.created', 1, { actor: CUSTOMER_ID }),
      makeEvent('booking.assignment.accepted', 2, {
        actor: TECHNICIAN_ID,
        fromStatus: 'assigned',
        toStatus: 'accepted',
      }),
      makeEvent('quote.created', 3, { actor: TECHNICIAN_ID }),
    ],
  });
  const decisionCalls: ReturnType<typeof mutationRecord>[] = [];
  const revisionCalls: ReturnType<typeof mutationRecord>[] = [];
  const transitionCalls: ReturnType<typeof mutationRecord>[] = [];
  const unexpected: string[] = [];

  await page.route('**/api/backend/v1/**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (
      pathname === `/api/backend/v1/customer/bookings/${BOOKING_ID}` &&
      request.method() === 'GET'
    ) {
      await fulfillJson(route, customerView(current));
      return;
    }
    if (
      pathname === `/api/backend/v1/technician/bookings/${BOOKING_ID}` &&
      request.method() === 'GET'
    ) {
      await fulfillJson(route, technicianView(current));
      return;
    }
    const quoteDecisionPrefix = `/api/backend/v1/customer/bookings/${BOOKING_ID}/quotes/`;
    if (
      pathname.startsWith(quoteDecisionPrefix) &&
      pathname.endsWith('/decision') &&
      request.method() === 'POST'
    ) {
      const quoteId = pathname.slice(quoteDecisionPrefix.length, -'/decision'.length);
      const quote = current.quotes.find((item) => item.id === quoteId);
      if (!quote) {
        unexpected.push(`${request.method()} ${pathname}`);
        await fulfillJson(route, { detail: 'Unexpected test-only API request.' }, 500);
        return;
      }
      const call = mutationRecord(route);
      decisionCalls.push(call);
      const body = request.postDataJSON() as {
        decision: 'approved' | 'rejected';
        note: string | null;
      };
      const updatedQuote: BookingQuote = {
        ...quote,
        status: body.decision,
        decision_by_user_id: CUSTOMER_ID,
        decided_at: nowIso(),
        decision_note: body.note,
      };
      current = {
        ...current,
        status: body.decision === 'rejected' ? 'quote_rejected' : 'approved',
        current_quote_status: body.decision,
        updated_at: nowIso(),
        version: current.version + 1,
        quotes: current.quotes.map((item) => (item.id === quoteId ? updatedQuote : item)),
        events: appendEvent(
          current,
          body.decision === 'rejected' ? 'quote.rejected' : 'quote.approved',
          {
            actor: CUSTOMER_ID,
            fromStatus: current.status,
            toStatus: body.decision === 'rejected' ? 'quote_rejected' : 'approved',
            note: body.note,
          },
        ),
      };
      await fulfillJson(route, customerView(current));
      return;
    }
    if (
      pathname === `/api/backend/v1/technician/bookings/${BOOKING_ID}/quotes` &&
      request.method() === 'POST'
    ) {
      revisionCalls.push(mutationRecord(route));
      const body = request.postDataJSON() as {
        items: {
          line_type: QuoteLineType;
          description: string;
          quantity: number;
          unit_amount_paise: number;
        }[];
        expires_at: string;
        technician_notes: string | null;
      };
      const oldQuote = current.quotes.find((quote) => quote.is_current)!;
      const supersededQuote: BookingQuote = {
        ...oldQuote,
        status: 'superseded',
        is_current: false,
      };
      const newQuoteItems = body.items.map((item, index) => ({
        id: `fixture-quote-2-line-${index + 1}`,
        position: index + 1,
        ...item,
        line_total_paise: item.quantity * item.unit_amount_paise,
      }));
      const revisedQuote: BookingQuote = {
        id: QUOTE_V2_ID,
        version: 2,
        status: 'pending',
        is_current: true,
        currency: 'INR',
        total_paise: newQuoteItems.reduce((total, item) => total + item.line_total_paise, 0),
        technician_notes: body.technician_notes,
        issued_at: nowIso(),
        expires_at: body.expires_at,
        is_expired: false,
        created_by_user_id: TECHNICIAN_ID,
        decision_by_user_id: null,
        decided_at: null,
        decision_note: null,
        line_items: newQuoteItems,
      };
      current = {
        ...current,
        status: 'quote_pending',
        current_quote_total_paise: revisedQuote.total_paise,
        current_quote_status: revisedQuote.status,
        updated_at: nowIso(),
        version: current.version + 1,
        quotes: [supersededQuote, revisedQuote],
        events: appendEvent(current, 'quote.revised', {
          actor: TECHNICIAN_ID,
          fromStatus: 'quote_rejected',
          toStatus: 'quote_pending',
        }),
      };
      await fulfillJson(route, technicianView(current));
      return;
    }
    if (
      pathname === `/api/backend/v1/technician/bookings/${BOOKING_ID}/transitions` &&
      request.method() === 'POST'
    ) {
      const call = mutationRecord(route);
      transitionCalls.push(call);
      const body = request.postDataJSON() as { action: 'start_work' | 'complete' };
      const nextStatus = body.action === 'start_work' ? 'in_progress' : 'completed';
      current = {
        ...current,
        status: nextStatus,
        updated_at: nowIso(),
        version: current.version + 1,
        events: appendEvent(
          current,
          body.action === 'start_work' ? 'booking.work.started' : 'booking.completed',
          {
            actor: TECHNICIAN_ID,
            fromStatus: current.status,
            toStatus: nextStatus,
          },
        ),
      };
      await fulfillJson(route, technicianView(current));
      return;
    }
    unexpected.push(`${request.method()} ${pathname}`);
    await fulfillJson(route, { detail: 'Unexpected test-only API request.' }, 500);
  });

  await page.goto(`/bookings/${BOOKING_ID}`);
  await expect(page.getByText('PriceLock quote · version 1')).toBeVisible();
  await expect(page.getByText('Fixture inspection and diagnostics')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve this quote' })).toBeVisible();

  await page.getByRole('button', { name: 'Decline quote' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Add a short reason of at least five characters' }),
  ).toBeVisible();
  expect(decisionCalls).toHaveLength(0);

  await page.locator('#quote-decision-note').fill('Please revise the test scope.');
  await page.getByRole('button', { name: 'Decline quote' }).click();
  await expect(page.getByText('Quote declined', { exact: true })).toBeVisible();
  await expect(page.getByText('Customer note: Please revise the test scope.')).toBeVisible();
  expect(decisionCalls).toHaveLength(1);
  expect(decisionCalls[0]?.body).toEqual({
    decision: 'rejected',
    note: 'Please revise the test scope.',
  });
  expect(decisionCalls[0]?.headers['idempotency-key']).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

  await page.goto(`/technician/bookings/${BOOKING_ID}`);
  await expect(
    page.getByRole('heading', { name: 'Create PriceLock revision · current version 1' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start approved repair work' })).toHaveCount(0);
  await page.locator('#quote-description-1').fill('Fixture revised inspection and labour');
  await page.locator('#quote-amount-1').fill('1200.50');
  await page.getByRole('button', { name: 'Submit revised quote' }).click();
  await expect(page.getByText('PriceLock version 2 was submitted.')).toBeVisible();
  await expect(page.getByText('PriceLock quote · version 2')).toBeVisible();
  await expect(page.getByText('₹1,200.50', { exact: true }).first()).toBeVisible();
  expect(revisionCalls).toHaveLength(1);
  expect(revisionCalls[0]?.body).toMatchObject({
    items: [
      {
        line_type: 'inspection',
        description: 'Fixture revised inspection and labour',
        quantity: 1,
        unit_amount_paise: 120_050,
      },
    ],
  });
  expect(revisionCalls[0]?.headers['idempotency-key']).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

  await page.goto(`/bookings/${BOOKING_ID}`);
  await expect(page.getByRole('button', { name: 'Approve this quote' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Approve this quote' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Approve this quote' }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Your approval of this PriceLock version is recorded.' }),
  ).toBeVisible();
  await expect(page.getByText('Quote approved', { exact: true })).toBeVisible();
  expect(decisionCalls).toHaveLength(2);
  expect(decisionCalls[1]?.body).toEqual({ decision: 'approved', note: null });

  await page.goto(`/technician/bookings/${BOOKING_ID}`);
  await expect(page.getByRole('button', { name: 'Start approved repair work' })).toBeVisible();
  await page.getByRole('button', { name: 'Start approved repair work' }).click();
  await expect(
    page.getByText('Repair work start recorded against the approved PriceLock quote.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Assigned work' })).toContainText(
    'Repair in progress',
  );
  await page.getByRole('button', { name: 'Mark service complete' }).click();
  await expect(page.getByText('Service completion recorded.', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Assigned work' })).toContainText(
    'Service completed',
  );
  expect(transitionCalls.map((call) => call.body.action)).toEqual(['start_work', 'complete']);
  expect(transitionCalls.every((call) => Boolean(call.headers['idempotency-key']))).toBe(true);
  expect(unexpected).toEqual([]);
  expectCleanBrowserAudit(browserAudit);
});

test('technician accepts an assignment before seeing the exact address, records an ETA and starts inspection', async ({
  page,
}) => {
  const browserAudit = watchBrowser(page);
  await page.setViewportSize({ width: 390, height: 844 });
  let current = makeBooking({ status: 'assigned', address: null });
  const assignmentCalls: ReturnType<typeof mutationRecord>[] = [];
  const visitCalls: ReturnType<typeof mutationRecord>[] = [];
  const transitionMutationCalls: ReturnType<typeof mutationRecord>[] = [];
  const unexpected: string[] = [];

  await page.route('**/api/backend/v1/**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (pathname === '/api/backend/v1/technician/bookings' && request.method() === 'GET') {
      await fulfillJson(route, bookingList(current));
      return;
    }
    if (
      pathname === `/api/backend/v1/technician/bookings/${BOOKING_ID}` &&
      request.method() === 'GET'
    ) {
      await fulfillJson(route, technicianView(current));
      return;
    }
    if (
      pathname === `/api/backend/v1/technician/bookings/${BOOKING_ID}/assignment-decision` &&
      request.method() === 'POST'
    ) {
      assignmentCalls.push(mutationRecord(route));
      current = {
        ...current,
        status: 'accepted',
        address: TEST_ADDRESS,
        address_locality: TEST_ADDRESS.locality,
        city: TEST_ADDRESS.city,
        location_access_limited: false,
        updated_at: nowIso(),
        version: current.version + 1,
        events: appendEvent(current, 'booking.assignment.accepted', {
          actor: TECHNICIAN_ID,
          fromStatus: 'assigned',
          toStatus: 'accepted',
        }),
      };
      await fulfillJson(route, {
        booking_id: BOOKING_ID,
        decision: 'accept',
        status: 'accepted',
      });
      return;
    }
    if (
      pathname === `/api/backend/v1/technician/bookings/${BOOKING_ID}/visit` &&
      request.method() === 'PUT'
    ) {
      visitCalls.push(mutationRecord(route));
      const body = request.postDataJSON() as {
        status: BookingVisit['status'];
        eta_at: string | null;
      };
      const visit: BookingVisit = {
        id: VISIT_ID,
        booking_id: BOOKING_ID,
        status: body.status,
        eta_at: body.eta_at,
        updated_by_user_id: TECHNICIAN_ID,
        updated_at: nowIso(),
        live_tracking_status: 'unavailable',
      };
      current = {
        ...current,
        visit,
        version: current.version + 1,
        events: appendEvent(current, 'booking.visit.updated', {
          actor: TECHNICIAN_ID,
          fromStatus: null,
          toStatus: body.status,
          note: `Visit status updated to ${body.status}.`,
        }),
      };
      await fulfillJson(route, visit);
      return;
    }
    if (
      pathname === `/api/backend/v1/technician/bookings/${BOOKING_ID}/transitions` &&
      request.method() === 'POST'
    ) {
      transitionMutationCalls.push(mutationRecord(route));
      current = {
        ...current,
        status: 'inspection_pending',
        updated_at: nowIso(),
        version: current.version + 1,
        events: appendEvent(current, 'booking.inspection.started', {
          actor: TECHNICIAN_ID,
          fromStatus: 'accepted',
          toStatus: 'inspection_pending',
        }),
      };
      await fulfillJson(route, technicianView(current));
      return;
    }
    unexpected.push(`${request.method()} ${pathname}`);
    await fulfillJson(route, { detail: 'Unexpected test-only API request.' }, 500);
  });

  await page.goto('/technician/bookings');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Your assigned service requests.' }),
  ).toBeVisible();
  await expect(page.getByText('Location shared after you accept the assignment.')).toBeVisible();
  await expect(page.locator('main')).not.toContainText(TEST_ADDRESS.address_line1);
  await page.getByRole('link', { name: 'Review assignment' }).click();
  await expect(page.getByRole('heading', { name: 'Respond to assignment' })).toBeVisible();
  await expect(page.locator('#visit-status')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText(TEST_ADDRESS.address_line1);

  await page.getByRole('button', { name: 'Accept assignment' }).click();
  await expect(
    page.getByText('Assignment accepted. Current booking status: accepted.'),
  ).toBeVisible();
  await expect(page.getByText(TEST_ADDRESS.address_line1)).toBeVisible();
  expect(assignmentCalls).toHaveLength(1);
  expect(assignmentCalls[0]?.body).toEqual({ decision: 'accept', note: null });
  expect(assignmentCalls[0]?.headers['idempotency-key']).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

  await page.locator('#visit-eta').fill('2030-01-01T12:30');
  await page.getByRole('button', { name: 'Save visit update' }).click();
  await expect(page.getByText('Manual visit status and ETA saved.')).toBeVisible();
  expect(visitCalls).toHaveLength(1);
  expect(visitCalls[0]?.body.status).toBe('scheduled');
  expect(visitCalls[0]?.body.eta_at).toEqual(expect.any(String));
  expect(visitCalls[0]?.headers['idempotency-key']).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

  await page.getByRole('button', { name: 'Start inspection' }).click();
  await expect(page.getByText('Inspection start recorded.')).toBeVisible();
  await expect(page.getByText('Inspection in progress', { exact: true })).toBeVisible();
  expect(transitionMutationCalls).toHaveLength(1);
  expect(transitionMutationCalls[0]?.body.action).toBe('start_inspection');
  expect(transitionMutationCalls[0]?.headers['idempotency-key']).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  await expectNoHorizontalOverflow(page, 'technician booking detail at 390 × 844');
  expect(unexpected).toEqual([]);
  expectCleanBrowserAudit(browserAudit);
});

test('technician can decline an assignment without receiving the exact service address', async ({
  page,
}) => {
  const browserAudit = watchBrowser(page);
  const current = makeBooking({ status: 'assigned', address: null });
  const assignmentCalls: ReturnType<typeof mutationRecord>[] = [];

  await page.route('**/api/backend/v1/**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (
      pathname === `/api/backend/v1/technician/bookings/${BOOKING_ID}` &&
      request.method() === 'GET'
    ) {
      await fulfillJson(route, technicianView(current));
      return;
    }
    if (
      pathname === `/api/backend/v1/technician/bookings/${BOOKING_ID}/assignment-decision` &&
      request.method() === 'POST'
    ) {
      assignmentCalls.push(mutationRecord(route));
      await fulfillJson(route, {
        booking_id: BOOKING_ID,
        decision: 'decline',
        status: 'requested',
      });
      return;
    }
    await fulfillJson(route, { detail: 'Unexpected test-only API request.' }, 500);
  });

  await page.goto(`/technician/bookings/${BOOKING_ID}`);
  await expect(page.getByRole('button', { name: 'Decline assignment' })).toBeVisible();
  await expect(page.locator('main')).not.toContainText(TEST_ADDRESS.address_line1);
  await page.getByRole('button', { name: 'Decline assignment' }).click();
  await expect(
    page.getByText('You declined this assignment. It has been returned to the admin queue.'),
  ).toBeVisible();
  await expect(page.locator('main')).not.toContainText(TEST_ADDRESS.address_line1);
  expect(assignmentCalls).toHaveLength(1);
  expect(assignmentCalls[0]?.body).toEqual({ decision: 'decline', note: null });
  expect(assignmentCalls[0]?.headers['idempotency-key']).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  expectCleanBrowserAudit(browserAudit);
});

test('admin filters and assigns bookings, then records visit ETA and readable audit history', async ({
  page,
}) => {
  const browserAudit = watchBrowser(page);
  await page.setViewportSize({ width: 390, height: 844 });
  let current = makeBooking({ status: 'requested', assigned: false });
  const listQueries: URL[] = [];
  const assignmentCalls: ReturnType<typeof mutationRecord>[] = [];
  const visitCalls: ReturnType<typeof mutationRecord>[] = [];
  const unexpected: string[] = [];
  const eligibleTechnicians = [
    {
      user_id: TECHNICIAN_ID,
      display_name: 'Fixture Technician',
      coverage_area: 'Fictional Pune zone',
      years_experience: 2,
    },
  ];

  await page.route('**/api/backend/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;
    if (pathname === '/api/backend/v1/admin/bookings' && request.method() === 'GET') {
      listQueries.push(url);
      await fulfillJson(route, bookingList(current));
      return;
    }
    if (pathname === `/api/backend/v1/admin/bookings/${BOOKING_ID}` && request.method() === 'GET') {
      await fulfillJson(route, current);
      return;
    }
    if (
      pathname === `/api/backend/v1/admin/bookings/${BOOKING_ID}/eligible-technicians` &&
      request.method() === 'GET'
    ) {
      await fulfillJson(route, eligibleTechnicians);
      return;
    }
    if (
      pathname === `/api/backend/v1/admin/bookings/${BOOKING_ID}/assign` &&
      request.method() === 'POST'
    ) {
      assignmentCalls.push(mutationRecord(route));
      current = {
        ...current,
        status: 'assigned',
        assigned_technician_user_id: TECHNICIAN_ID,
        assigned_technician_name: 'Fixture Technician',
        updated_at: nowIso(),
        version: current.version + 1,
        events: appendEvent(current, 'booking.assignment.assigned', {
          actor: ADMIN_ID,
          target: TECHNICIAN_ID,
          fromStatus: 'requested',
          toStatus: 'assigned',
          note: 'Fixture assignment note.',
          isInternal: true,
        }),
      };
      await fulfillJson(route, current);
      return;
    }
    if (
      pathname === `/api/backend/v1/technician/bookings/${BOOKING_ID}` &&
      request.method() === 'GET'
    ) {
      await fulfillJson(route, technicianView(current));
      return;
    }
    if (
      pathname === `/api/backend/v1/technician/bookings/${BOOKING_ID}/assignment-decision` &&
      request.method() === 'POST'
    ) {
      current = {
        ...current,
        status: 'accepted',
        updated_at: nowIso(),
        version: current.version + 1,
        events: appendEvent(current, 'booking.assignment.accepted', {
          actor: TECHNICIAN_ID,
          fromStatus: 'assigned',
          toStatus: 'accepted',
        }),
      };
      await fulfillJson(route, {
        booking_id: BOOKING_ID,
        decision: 'accept',
        status: 'accepted',
      });
      return;
    }
    if (
      pathname === `/api/backend/v1/admin/bookings/${BOOKING_ID}/visit` &&
      request.method() === 'PUT'
    ) {
      const call = mutationRecord(route);
      visitCalls.push(call);
      const body = request.postDataJSON() as {
        status: BookingVisit['status'];
        eta_at: string | null;
      };
      const previousStatus = current.visit?.status ?? null;
      const visit: BookingVisit = {
        id: current.visit?.id ?? VISIT_ID,
        booking_id: BOOKING_ID,
        status: body.status,
        eta_at: body.eta_at,
        updated_by_user_id: ADMIN_ID,
        updated_at: nowIso(),
        live_tracking_status: 'unavailable',
      };
      current = {
        ...current,
        visit,
        updated_at: nowIso(),
        version: current.version + 1,
        events: appendEvent(current, 'booking.visit.updated', {
          actor: ADMIN_ID,
          target: TECHNICIAN_ID,
          fromStatus: previousStatus,
          toStatus: body.status,
          note: `Visit status updated to ${body.status}.`,
          isInternal: true,
        }),
      };
      await fulfillJson(route, visit);
      return;
    }
    unexpected.push(`${request.method()} ${pathname}`);
    await fulfillJson(route, { detail: 'Unexpected test-only API request.' }, 500);
  });

  await page.goto('/admin/bookings');
  await expect(page.getByRole('heading', { level: 1, name: 'Booking oversight.' })).toBeVisible();
  await page.getByLabel('Status', { exact: true }).selectOption('requested');
  await page.getByLabel('Service slug').fill('ac-repair');
  const filteredResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === '/api/backend/v1/admin/bookings' &&
      url.searchParams.get('status') === 'requested' &&
      url.searchParams.get('service_slug') === 'ac-repair'
    );
  });
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await filteredResponse;
  expect(listQueries.at(-1)?.searchParams.get('status')).toBe('requested');
  expect(listQueries.at(-1)?.searchParams.get('service_slug')).toBe('ac-repair');

  await page.getByRole('link', { name: 'Review booking' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'AC Repair' })).toBeVisible();
  await expect(page.getByText(TEST_ADDRESS.address_line1)).toBeVisible();
  await page.getByLabel('Eligible technician').selectOption(TECHNICIAN_ID);
  await page.getByLabel('Admin assignment note · optional').fill('Fixture assignment note.');
  await page.getByRole('button', { name: 'Assign technician' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Assignment recorded for Fixture Technician.' }),
  ).toBeVisible();
  await expect(page.locator('ol').getByText('Technician assigned', { exact: true })).toBeVisible();
  expect(assignmentCalls).toHaveLength(1);
  expect(assignmentCalls[0]?.body).toEqual({
    technician_user_id: TECHNICIAN_ID,
    note: 'Fixture assignment note.',
  });
  expect(assignmentCalls[0]?.headers['idempotency-key']).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  await expectNoHorizontalOverflow(page, 'admin booking detail at 390 × 844');

  await page.goto(`/technician/bookings/${BOOKING_ID}`);
  await expect(page.getByRole('button', { name: 'Accept assignment' })).toBeVisible();
  await expect(page.locator('main')).not.toContainText(TEST_ADDRESS.address_line1);
  await page.getByRole('button', { name: 'Accept assignment' }).click();
  await expect(page.getByText(TEST_ADDRESS.address_line1)).toBeVisible();

  await page.goto(`/admin/bookings/${BOOKING_ID}`);
  await expect(page.locator('#admin-visit-status')).toHaveValue('scheduled');
  await page.locator('#admin-visit-eta').fill('2030-01-01T10:30');
  await page.getByRole('button', { name: 'Save visit update' }).click();
  await expect(page.getByText('Manual visit status and ETA saved.')).toBeVisible();
  expect(visitCalls[0]?.body.status).toBe('scheduled');
  expect(visitCalls[0]?.body.eta_at).toEqual(expect.any(String));

  await page.locator('#admin-visit-status').selectOption('en_route');
  await page.locator('#admin-visit-eta').fill('2030-01-01T11:30');
  await page.getByRole('button', { name: 'Save visit update' }).click();
  await expect(page.locator('#admin-booking-main')).toContainText('Current visit status: en route');
  await expect(page.getByText('scheduled → en route', { exact: true })).toBeVisible();
  await expect(page.getByText('Manual visit status updated', { exact: true })).toHaveCount(2);
  await expect(page.getByText('Admin only').first()).toBeVisible();
  expect(visitCalls[1]?.body.status).toBe('en_route');
  expect(visitCalls[1]?.body.eta_at).toEqual(expect.any(String));
  expect(visitCalls.every((call) => Boolean(call.headers['idempotency-key']))).toBe(true);
  expect(unexpected).toEqual([]);
  expectCleanBrowserAudit(browserAudit);
});

test('customer, technician, and admin booking screens keep private records unavailable without role access', async ({
  page,
}) => {
  const browserAudit = watchBrowser(page);
  await page.route('**/api/backend/v1/**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/api/backend/v1/customer/addresses')) {
      await fulfillJson(
        route,
        { detail: { code: 'unauthorized', message: 'Authentication required.' } },
        401,
      );
      return;
    }
    if (pathname.startsWith('/api/backend/v1/customer/bookings')) {
      await fulfillJson(
        route,
        { detail: { code: 'unauthorized', message: 'Authentication required.' } },
        401,
      );
      return;
    }
    if (
      pathname.startsWith('/api/backend/v1/technician/bookings') ||
      pathname.startsWith('/api/backend/v1/admin/bookings')
    ) {
      await fulfillJson(route, { detail: { code: 'forbidden', message: 'Access denied.' } }, 403);
      return;
    }
    await fulfillJson(route, { detail: 'Unexpected test-only API request.' }, 500);
  });

  await page.goto('/bookings');
  await expect(
    page.getByText('Sign in with an active FixNear account to continue.', { exact: true }),
  ).toBeVisible();
  await page.goto(`/bookings/${BOOKING_ID}`);
  await expect(
    page.getByText('Sign in with an active FixNear account to continue.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('main')).not.toContainText(TEST_ADDRESS.address_line1);
  await expect(page.getByRole('button', { name: 'Cancel service request' })).toHaveCount(0);

  await page.goto('/technician/bookings');
  await expect(
    page.getByText('This action requires the appropriate server-managed FixNear role.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('main')).not.toContainText(TEST_ADDRESS.address_line1);
  await expect(page.getByRole('button', { name: 'Accept assignment' })).toHaveCount(0);

  await page.goto('/admin/bookings');
  await expect(
    page.getByText('This action requires the appropriate server-managed FixNear role.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('main')).not.toContainText(TEST_ADDRESS.address_line1);
  await expect(page.getByRole('link', { name: 'Review booking' })).toHaveCount(0);
  await page.goto(`/admin/bookings/${BOOKING_ID}`);
  await expect(
    page.getByText('This action requires the appropriate server-managed FixNear role.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('main')).not.toContainText(TEST_ADDRESS.address_line1);
  expectCleanBrowserAudit(browserAudit);
});
