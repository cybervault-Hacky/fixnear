'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarDays,
  ClipboardList,
  LocateFixed,
  MapPin,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { BookingFrame } from '@/features/bookings/components/BookingFrame';
import { messageForBookingError, Notice } from '@/features/bookings/components/booking-ui';
import {
  createCustomerBooking,
  listCustomerAddresses,
  newIdempotencyKey,
} from '@/lib/api/bookings';
import type { CustomerAddress, CustomerAddressInput } from '@/lib/api/bookings';
import { BrowserLocationError, requestBrowserLocation } from '@/lib/location/browser-location';
import { listPublicServices } from '@/lib/api/service-catalog';
import type { ServiceGuide } from '@/lib/api/service-catalog';

const timeWindows = [
  { start: '09:00', end: '12:00', label: '9:00 AM–12:00 PM' },
  { start: '12:00', end: '15:00', label: '12:00–3:00 PM' },
  { start: '15:00', end: '18:00', label: '3:00–6:00 PM' },
  { start: '18:00', end: '20:00', label: '6:00–8:00 PM' },
] as const;

const blankAddress: CustomerAddressInput = {
  label: 'Home',
  recipient_name: '',
  address_line1: '',
  address_line2: null,
  locality: '',
  city: 'Pune',
  state: 'Maharashtra',
  postal_code: '',
  contact_phone: null,
  latitude: null,
  longitude: null,
  location_accuracy_meters: null,
  is_default: false,
};

function tomorrowInPune(): string {
  const now = new Date();
  const local = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 12),
  );
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(local);
}

type CustomerBookingCreatePageProps = { initialServiceSlug?: string };

export function CustomerBookingCreatePage({
  initialServiceSlug = '',
}: CustomerBookingCreatePageProps) {
  const router = useRouter();
  const [services, setServices] = useState<ServiceGuide[]>([]);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [serviceSlug, setServiceSlug] = useState(initialServiceSlug);
  const [selectedAddress, setSelectedAddress] = useState('new');
  const [addressDraft, setAddressDraft] = useState<CustomerAddressInput>(blankAddress);
  const [addressLocationState, setAddressLocationState] = useState<
    'idle' | 'requesting' | 'attached' | 'denied' | 'unavailable'
  >('idle');
  const [addressLocationMessage, setAddressLocationMessage] = useState('');
  const [saveAddress, setSaveAddress] = useState(false);
  const [problem, setProblem] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [windowIndex, setWindowIndex] = useState('0');
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    void Promise.all([listPublicServices(), listCustomerAddresses()])
      .then(([serviceResults, addressResults]) => {
        if (!active) return;
        setServices(serviceResults);
        setAddresses(addressResults);
        setServiceSlug((current) => {
          if (current && serviceResults.some((service) => service.slug === current)) return current;
          return serviceResults[0]?.slug ?? '';
        });
        setSelectedAddress((current) => {
          if (current !== 'new' && addressResults.some((address) => address.id === current)) {
            return current;
          }
          return addressResults.find((address) => address.is_default)?.id ?? 'new';
        });
        setPreferredDate(tomorrowInPune());
        setLoadError('');
      })
      .catch((error: unknown) => {
        if (active) setLoadError(messageForBookingError(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadAttempt]);

  useEffect(() => {
    if (initialServiceSlug && services.some((service) => service.slug === initialServiceSlug)) {
      setServiceSlug(initialServiceSlug);
    }
  }, [initialServiceSlug, services]);

  const resetRequestKey = () => {
    idempotencyKey.current = null;
    setSubmitError('');
  };

  const updateAddress = (
    field: keyof CustomerAddressInput,
    value: string | boolean | number | null,
  ) => {
    resetRequestKey();
    const addressChanged = [
      'address_line1',
      'address_line2',
      'locality',
      'city',
      'state',
      'postal_code',
    ].includes(field);
    if (addressChanged && addressLocationState === 'attached') {
      setAddressLocationState('idle');
      setAddressLocationMessage(
        'Address text changed, so the previous device coordinates were cleared.',
      );
    }
    setAddressDraft((current) => ({
      ...current,
      [field]: value === '' && ['address_line2', 'contact_phone'].includes(field) ? null : value,
      ...(addressChanged
        ? { latitude: null, longitude: null, location_accuracy_meters: null }
        : {}),
    }));
  };

  const captureAddressLocation = async () => {
    setAddressLocationState('requesting');
    setAddressLocationMessage('Waiting for one foreground location fix…');
    try {
      const location = await requestBrowserLocation();
      resetRequestKey();
      setAddressDraft((current) => ({
        ...current,
        latitude: location.latitude,
        longitude: location.longitude,
        location_accuracy_meters: location.accuracyMeters,
      }));
      setAddressLocationState('attached');
      setAddressLocationMessage(
        `Device coordinates attached (reported accuracy ±${Math.round(location.accuracyMeters)} m). They are saved only with this service address; no background tracking is used.`,
      );
    } catch (error) {
      const code = error instanceof BrowserLocationError ? error.code : 'unavailable';
      setAddressLocationState(code === 'permission_denied' ? 'denied' : 'unavailable');
      setAddressLocationMessage(
        code === 'permission_denied'
          ? 'Location permission was denied. You can continue with the typed service address.'
          : 'Device location is unavailable. You can continue with the typed service address.',
      );
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError('');
    if (problem.trim().length < 20) {
      setSubmitError(
        'Describe the issue in at least 20 characters so the request has useful context.',
      );
      return;
    }
    if (!serviceSlug) {
      setSubmitError('Choose an active service guide before submitting.');
      return;
    }
    const earliestDate = tomorrowInPune();
    if (!preferredDate || preferredDate < earliestDate) {
      setSubmitError('Choose a future preferred service date.');
      return;
    }
    const selectedWindow = timeWindows[Number(windowIndex)];
    if (!selectedWindow) {
      setSubmitError('Choose a preferred time window.');
      return;
    }
    const requestAddress =
      selectedAddress === 'new'
        ? {
            ...addressDraft,
            label: addressDraft.label.trim(),
            recipient_name: addressDraft.recipient_name.trim(),
            address_line1: addressDraft.address_line1.trim(),
            address_line2: addressDraft.address_line2?.trim() || null,
            locality: addressDraft.locality.trim(),
            city: addressDraft.city.trim(),
            state: addressDraft.state.trim(),
            postal_code: addressDraft.postal_code.trim(),
            contact_phone: addressDraft.contact_phone?.trim() || null,
          }
        : null;
    if (
      selectedAddress === 'new' &&
      (!requestAddress?.label ||
        !requestAddress.recipient_name ||
        requestAddress.address_line1.length < 5 ||
        !requestAddress.locality ||
        !requestAddress.city ||
        !requestAddress.state ||
        !/^[0-9A-Za-z -]{4,12}$/.test(requestAddress.postal_code))
    ) {
      setSubmitError('Complete the required address fields with a valid postal code.');
      return;
    }
    if (
      requestAddress?.contact_phone &&
      !/^\+[1-9][0-9]{7,14}$/.test(requestAddress.contact_phone)
    ) {
      setSubmitError(
        'Enter an optional phone number in international format, such as +919876543210.',
      );
      return;
    }

    idempotencyKey.current ??= newIdempotencyKey();
    setBusy(true);
    try {
      const created = await createCustomerBooking(
        {
          service_slug: serviceSlug,
          ...(selectedAddress === 'new'
            ? { new_address: requestAddress!, save_new_address: saveAddress }
            : { address_id: selectedAddress }),
          problem_description: problem.trim(),
          preferred_date: preferredDate,
          preferred_start: selectedWindow.start,
          preferred_end: selectedWindow.end,
          timezone_name: 'Asia/Kolkata',
        },
        idempotencyKey.current,
      );
      idempotencyKey.current = null;
      router.push(`/bookings/${created.id}`);
    } catch (error) {
      setSubmitError(messageForBookingError(error));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <BookingFrame narrow>
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-midnight/10 bg-white p-6 text-sm text-midnight/65"
        >
          Loading active services and saved addresses…
        </div>
      </BookingFrame>
    );
  }

  if (loadError) {
    return (
      <BookingFrame narrow>
        <DashboardPageHeader
          eyebrow="Customer · service request"
          title="Request a home service."
          description="Choose an active service, share the issue and select a preferred time window."
        />
        <DashboardCard
          title="Could not load booking options"
          description={loadError}
          icon={ShieldCheck}
        >
          <p className="text-sm leading-6 text-midnight/65">
            Active service guides and private addresses are loaded from the FixNear API. No demo
            address or availability is substituted.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-midnight px-4 text-sm font-semibold text-white hover:bg-[#1d2a3f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
            >
              <RefreshCw aria-hidden="true" size={15} />
              Retry
            </button>
            <Button href="/bookings" variant="secondary">
              View my requests
            </Button>
          </div>
        </DashboardCard>
      </BookingFrame>
    );
  }

  return (
    <BookingFrame narrow>
      <DashboardPageHeader
        eyebrow="Customer · service request"
        title="Tell us what needs attention."
        description="Submit a request for an active service guide, choose a saved address or enter one for this request, and suggest a preferred time window."
        action={
          <Button href="/bookings" variant="secondary" size="small">
            My requests
          </Button>
        }
      />

      {services.length === 0 ? (
        <DashboardCard
          title="No active service guides"
          description="A request can be submitted after an administrator publishes an active guide."
          icon={ClipboardList}
        >
          <p className="text-sm leading-6 text-midnight/65">
            No service or price is invented for this request.
          </p>
          <Button href="/services" variant="secondary" className="mt-5">
            Browse guides
          </Button>
        </DashboardCard>
      ) : (
        <form onSubmit={submit} noValidate className="grid gap-5">
          {submitError ? <Notice kind="error">{submitError}</Notice> : null}
          <DashboardCard
            title="Service and issue"
            description="A service request is not a diagnosis or confirmed appointment."
            icon={ClipboardList}
          >
            <div className="grid gap-5">
              <div className="grid gap-2">
                <label htmlFor="booking-service" className="text-sm font-semibold text-midnight">
                  Active service guide
                </label>
                <select
                  id="booking-service"
                  required
                  value={serviceSlug}
                  onChange={(event) => {
                    resetRequestKey();
                    setServiceSlug(event.currentTarget.value);
                  }}
                  className="min-h-12 w-full rounded-xl border border-midnight/15 bg-white px-3 text-sm text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
                >
                  {services.map((service) => (
                    <option key={service.id} value={service.slug}>
                      {service.title}
                    </option>
                  ))}
                </select>
                <p className="text-xs leading-5 text-midnight/55">
                  Only active catalog entries are available. No fixed price is shown here.
                </p>
              </div>
              <div className="grid gap-2">
                <label htmlFor="booking-problem" className="text-sm font-semibold text-midnight">
                  What is happening?
                </label>
                <textarea
                  id="booking-problem"
                  required
                  minLength={20}
                  maxLength={4000}
                  rows={5}
                  value={problem}
                  onChange={(event) => {
                    resetRequestKey();
                    setProblem(event.currentTarget.value);
                  }}
                  placeholder="Describe the symptom, when it started, and any helpful context. Avoid sharing passwords or payment details."
                  className="w-full resize-y rounded-xl border border-midnight/15 bg-white px-3.5 py-3 text-sm leading-6 text-midnight outline-none placeholder:text-midnight/35 focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
                  aria-describedby="problem-help"
                />
                <p id="problem-help" className="text-xs leading-5 text-midnight/55">
                  At least 20 characters · {problem.length}/4000
                </p>
              </div>
            </div>
          </DashboardCard>

          <DashboardCard
            title="Service address"
            description="The request stores a private snapshot. You can use an address you saved earlier or enter a one-time address."
            icon={MapPin}
          >
            <fieldset className="grid gap-3">
              <legend className="mb-2 text-sm font-semibold text-midnight">
                Choose an address
              </legend>
              {addresses.map((address) => (
                <label
                  key={address.id}
                  className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-4 ${selectedAddress === address.id ? 'border-midnight/30 bg-[#f8faf7]' : 'border-midnight/10 bg-white'}`}
                >
                  <input
                    type="radio"
                    name="booking-address"
                    value={address.id}
                    checked={selectedAddress === address.id}
                    onChange={() => {
                      resetRequestKey();
                      setSelectedAddress(address.id);
                    }}
                    className="mt-0.5 size-5 accent-[#101827] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
                  />
                  <span className="min-w-0 text-sm leading-6 text-midnight/75">
                    <span className="font-semibold text-midnight">
                      {address.label}
                      {address.is_default ? ' · default' : ''}
                    </span>
                    <span className="block break-words">
                      {address.address_line1}
                      {address.address_line2 ? `, ${address.address_line2}` : ''},{' '}
                      {address.locality}, {address.city}, {address.state} {address.postal_code}
                    </span>
                    <span className="block text-xs text-midnight/50">
                      For {address.recipient_name}
                    </span>
                  </span>
                </label>
              ))}
              <label
                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-4 ${selectedAddress === 'new' ? 'border-midnight/30 bg-[#f8faf7]' : 'border-midnight/10 bg-white'}`}
              >
                <input
                  type="radio"
                  name="booking-address"
                  value="new"
                  checked={selectedAddress === 'new'}
                  onChange={() => {
                    resetRequestKey();
                    setSelectedAddress('new');
                  }}
                  className="size-5 accent-[#101827] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
                />
                <span className="text-sm font-semibold text-midnight">Enter a new address</span>
              </label>
            </fieldset>

            {selectedAddress === 'new' ? (
              <div className="mt-5 grid gap-4 rounded-xl border border-midnight/8 bg-[#fbfcfa] p-4 sm:grid-cols-2 sm:p-5">
                <Field
                  label="Address label"
                  id="address-label"
                  value={addressDraft.label}
                  onChange={(value) => updateAddress('label', value)}
                  placeholder="Home, work, or other"
                  maxLength={40}
                />
                <Field
                  label="Recipient name"
                  id="address-recipient"
                  value={addressDraft.recipient_name}
                  onChange={(value) => updateAddress('recipient_name', value)}
                  autoComplete="name"
                  maxLength={120}
                />
                <Field
                  label="Address line 1"
                  id="address-line1"
                  value={addressDraft.address_line1}
                  onChange={(value) => updateAddress('address_line1', value)}
                  autoComplete="address-line1"
                  className="sm:col-span-2"
                />
                <Field
                  label="Address line 2 · optional"
                  id="address-line2"
                  value={addressDraft.address_line2 ?? ''}
                  onChange={(value) => updateAddress('address_line2', value)}
                  autoComplete="address-line2"
                  className="sm:col-span-2"
                />
                <Field
                  label="Locality / area"
                  id="address-locality"
                  value={addressDraft.locality}
                  onChange={(value) => updateAddress('locality', value)}
                  autoComplete="address-level3"
                  maxLength={120}
                />
                <Field
                  label="City"
                  id="address-city"
                  value={addressDraft.city}
                  onChange={(value) => updateAddress('city', value)}
                  autoComplete="address-level2"
                  maxLength={120}
                />
                <Field
                  label="State"
                  id="address-state"
                  value={addressDraft.state}
                  onChange={(value) => updateAddress('state', value)}
                  autoComplete="address-level1"
                  maxLength={120}
                />
                <Field
                  label="Postal code"
                  id="address-postal"
                  value={addressDraft.postal_code}
                  onChange={(value) => updateAddress('postal_code', value)}
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={12}
                />
                <Field
                  label="Contact phone · optional"
                  id="address-phone"
                  value={addressDraft.contact_phone ?? ''}
                  onChange={(value) => updateAddress('contact_phone', value)}
                  type="tel"
                  placeholder="+919876543210"
                  autoComplete="tel"
                  className="sm:col-span-2"
                />
                <div className="grid gap-2 sm:col-span-2">
                  <button
                    type="button"
                    onClick={() => void captureAddressLocation()}
                    disabled={addressLocationState === 'requesting'}
                    className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-midnight/15 bg-white px-4 text-sm font-semibold text-midnight transition hover:bg-[#f8faf7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight disabled:cursor-wait disabled:opacity-60"
                  >
                    <LocateFixed aria-hidden="true" size={16} />
                    {addressLocationState === 'requesting'
                      ? 'Requesting device location…'
                      : addressLocationState === 'attached'
                        ? 'Refresh exact address location'
                        : 'Use device location for this address'}
                  </button>
                  <p
                    role="status"
                    aria-live="polite"
                    className="text-xs leading-5 text-midnight/55"
                  >
                    {addressLocationMessage ||
                      'Optional. Tap only when this device is at the service address; the browser asks permission. The coordinates are private and are not shared before technician acceptance.'}
                  </p>
                </div>
                <label className="flex min-h-11 items-center gap-3 text-sm text-midnight/75 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={saveAddress}
                    onChange={(event) => {
                      resetRequestKey();
                      setSaveAddress(event.currentTarget.checked);
                    }}
                    className="size-5 accent-[#101827] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
                  />
                  Save this address privately for future requests
                </label>
              </div>
            ) : null}
          </DashboardCard>

          <DashboardCard
            title="Preferred time window"
            description="This is a request only. No technician is automatically matched and no time is confirmed."
            icon={CalendarDays}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <label htmlFor="preferred-date" className="text-sm font-semibold text-midnight">
                  Preferred date
                </label>
                <input
                  id="preferred-date"
                  type="date"
                  required
                  min={tomorrowInPune()}
                  value={preferredDate}
                  onChange={(event) => {
                    resetRequestKey();
                    setPreferredDate(event.currentTarget.value);
                  }}
                  className="min-h-12 rounded-xl border border-midnight/15 bg-white px-3 text-sm text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="preferred-window" className="text-sm font-semibold text-midnight">
                  Preferred local time window
                </label>
                <select
                  id="preferred-window"
                  value={windowIndex}
                  onChange={(event) => {
                    resetRequestKey();
                    setWindowIndex(event.currentTarget.value);
                  }}
                  className="min-h-12 rounded-xl border border-midnight/15 bg-white px-3 text-sm text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
                >
                  {timeWindows.map((window, index) => (
                    <option key={window.start} value={index}>
                      {window.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-midnight/55">
              Time zone: Asia/Kolkata. This preference is not live availability or a confirmed
              appointment.
            </p>
          </DashboardCard>

          <Notice kind="info">
            Photo upload is being prepared through a storage-provider interface, but no file storage
            is configured. Submit the request without an attachment for now.
          </Notice>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button href="/services" variant="secondary">
              Back to service guides
            </Button>
            <button
              type="submit"
              disabled={busy || services.length === 0}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-midnight px-5 text-sm font-semibold text-white transition hover:bg-[#1d2a3f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? 'Submitting request…' : 'Submit service request'}
            </button>
          </div>
          <p className="text-center text-xs leading-5 text-midnight/50 sm:text-right">
            Submitting creates a request, not a confirmed time or a price commitment.
          </p>
        </form>
      )}
    </BookingFrame>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  autoComplete,
  inputMode,
  className = '',
  maxLength = type === 'tel' ? 16 : 200,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  inputMode?: 'text' | 'numeric' | 'tel';
  className?: string;
  maxLength?: number;
}) {
  return (
    <div className={`grid gap-2 ${className}`}>
      <label htmlFor={id} className="text-xs font-semibold text-midnight/75">
        {label}
      </label>
      <input
        id={id}
        required={!label.includes('optional')}
        type={type}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        className="min-h-11 w-full rounded-xl border border-midnight/15 bg-white px-3 text-sm text-midnight outline-none placeholder:text-midnight/35 focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
      />
    </div>
  );
}
