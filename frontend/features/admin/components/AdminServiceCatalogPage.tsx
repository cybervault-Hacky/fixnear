'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  Archive,
  ArrowUpRight,
  BookOpenText,
  CircleAlert,
  Database,
  LoaderCircle,
  Plus,
  Save,
  Tags,
  Undo2,
} from 'lucide-react';
import Link from 'next/link';

import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import { FixNearApiError } from '@/lib/api/client';
import {
  createService,
  createServiceCategory,
  deactivateService,
  deactivateServiceCategory,
  listAdminServiceCategories,
  listAdminServices,
  updateService,
  updateServiceCategory,
} from '@/lib/api/service-catalog';
import type {
  AdminServiceCategory,
  AdminServiceGuide,
  ServiceCreate,
  ServiceProblem,
  ServiceQuestion,
} from '@/lib/api/service-catalog';

type LoadState = 'loading' | 'ready' | 'unauthorized' | 'unavailable';
type CategoryDraft = {
  slug: string;
  title: string;
  description: string;
  display_order: string;
};
type ServiceDraft = {
  category_slug: string;
  slug: string;
  title: string;
  home_title: string;
  home_description: string;
  description: string;
  listing_description: string;
  keywords: string;
  common_problems: string;
  inspection_scope: string;
  questions: string;
  related_service_slugs: string;
  display_order: string;
  is_active: boolean;
};

type CatalogState = {
  loadState: LoadState;
  message: string;
  categories: AdminServiceCategory[];
  services: AdminServiceGuide[];
};

const newCategoryDraft = (): CategoryDraft => ({
  slug: '',
  title: '',
  description: '',
  display_order: '0',
});

const newServiceDraft = (categorySlug = ''): ServiceDraft => ({
  category_slug: categorySlug,
  slug: '',
  title: '',
  home_title: '',
  home_description: '',
  description: '',
  listing_description: '',
  keywords: '',
  common_problems: '[]',
  inspection_scope: '',
  questions: '[]',
  related_service_slugs: '',
  display_order: '0',
  is_active: true,
});

function listFromLines(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJsonArray<T>(value: string, label: string): T[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
  if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array.`);
  return parsed as T[];
}

function formError(error: unknown): string {
  if (error instanceof FixNearApiError) {
    if (error.status === 401) return 'Sign in with an active FixNear account to continue.';
    if (error.status === 403) return 'This action requires an authorized admin role.';
    if (error.status === 409) return error.message;
    if (error.status === 503)
      return 'The database API is not configured or is temporarily unavailable.';
    return error.message;
  }
  return error instanceof Error ? error.message : 'The catalog request could not be completed.';
}

function AdminTextarea({
  id,
  label,
  value,
  onChange,
  helperText,
  rows = 3,
  required = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
  rows?: number;
  required?: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-midnight">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        rows={rows}
        required={required}
        className="w-full min-w-0 resize-y rounded-xl border border-midnight/15 bg-white px-3.5 py-3 text-sm leading-6 text-midnight outline-none transition placeholder:text-midnight/40 focus:border-midnight/50 focus:ring-2 focus:ring-lime/55 motion-reduce:transition-none"
      />
      {helperText ? <p className="text-xs leading-5 text-midnight/55">{helperText}</p> : null}
    </div>
  );
}

function TextInput({
  id,
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  min,
  max,
  helperText,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'number';
  required?: boolean;
  min?: number;
  max?: number;
  helperText?: string;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-midnight">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        required={required}
        min={min}
        max={max}
        step={type === 'number' ? 1 : undefined}
        className="min-h-12 w-full min-w-0 rounded-xl border border-midnight/15 bg-white px-3.5 text-sm text-midnight outline-none transition focus:border-midnight/50 focus:ring-2 focus:ring-lime/55 motion-reduce:transition-none"
      />
      {helperText ? <p className="text-xs leading-5 text-midnight/55">{helperText}</p> : null}
    </div>
  );
}

export function AdminServiceCatalogPage() {
  const [catalog, setCatalog] = useState<CatalogState>({
    loadState: 'loading',
    message: '',
    categories: [],
    services: [],
  });
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>(newCategoryDraft);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [serviceDraft, setServiceDraft] = useState<ServiceDraft>(newServiceDraft());
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [actionError, setActionError] = useState('');
  const categoryFormId = useId();
  const serviceFormId = useId();

  const reload = async () => {
    const [categories, services] = await Promise.all([
      listAdminServiceCategories(),
      listAdminServices(),
    ]);
    setCatalog({ loadState: 'ready', message: '', categories, services });
  };

  useEffect(() => {
    let active = true;
    void Promise.all([listAdminServiceCategories(), listAdminServices()])
      .then(([categories, services]) => {
        if (!active) return;
        setCatalog({ loadState: 'ready', message: '', categories, services });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = formError(error);
        const unauthorized = error instanceof FixNearApiError && [401, 403].includes(error.status);
        setCatalog({
          loadState: unauthorized ? 'unauthorized' : 'unavailable',
          message,
          categories: [],
          services: [],
        });
      });
    return () => {
      active = false;
    };
  }, []);

  const runAction = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    setActionError('');
    setFeedback('');
    try {
      await action();
      setFeedback(success);
    } catch (error) {
      setActionError(formError(error));
    } finally {
      setBusy(false);
    }
  };

  const submitCategory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const order = Number(categoryDraft.display_order);
    if (!Number.isInteger(order) || order < 0) {
      setActionError('Category order must be a whole number greater than or equal to zero.');
      return;
    }
    void runAction(
      async () => {
        const payload = {
          slug: categoryDraft.slug.trim(),
          title: categoryDraft.title.trim(),
          description: categoryDraft.description.trim(),
          display_order: order,
        };
        if (editingCategoryId) {
          await updateServiceCategory(editingCategoryId, payload);
        } else {
          await createServiceCategory(payload);
        }
        await reload();
        setEditingCategoryId(null);
        setCategoryDraft(newCategoryDraft());
      },
      editingCategoryId ? 'Category changes saved.' : 'Category created.',
    );
  };

  const startCategoryEdit = (category: AdminServiceCategory) => {
    setEditingCategoryId(category.id);
    setCategoryDraft({
      slug: category.slug,
      title: category.title,
      description: category.description,
      display_order: String(category.display_order),
    });
    setActionError('');
    setFeedback('');
  };

  const updateCategoryStatus = (category: AdminServiceCategory, isActive: boolean) => {
    if (
      !isActive &&
      !window.confirm(
        `Deactivate “${category.title}”? Its services will no longer appear publicly while the category is inactive.`,
      )
    )
      return;
    void runAction(
      async () => {
        if (isActive) await updateServiceCategory(category.id, { is_active: true });
        else await deactivateServiceCategory(category.id);
        await reload();
      },
      isActive ? 'Category restored.' : 'Category deactivated.',
    );
  };

  const startServiceEdit = (service: AdminServiceGuide) => {
    setEditingServiceId(service.id);
    setServiceDraft({
      category_slug: service.category.slug,
      slug: service.slug,
      title: service.title,
      home_title: service.home_title,
      home_description: service.home_description,
      description: service.description,
      listing_description: service.listing_description,
      keywords: service.keywords.join('\n'),
      common_problems: JSON.stringify(service.common_problems, null, 2),
      inspection_scope: service.inspection_scope.join('\n'),
      questions: JSON.stringify(service.questions, null, 2),
      related_service_slugs: service.related_service_slugs.join('\n'),
      display_order: String(service.display_order),
      is_active: service.is_active,
    });
    setActionError('');
    setFeedback('');
    document.getElementById(serviceFormId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const submitService = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const displayOrder = Number(serviceDraft.display_order);
    if (!Number.isInteger(displayOrder) || displayOrder < 0) {
      setActionError('Service order must be a whole number greater than or equal to zero.');
      return;
    }
    let commonProblems: ServiceProblem[];
    let questions: ServiceQuestion[];
    try {
      commonProblems = parseJsonArray<ServiceProblem>(
        serviceDraft.common_problems,
        'Common problems',
      );
      questions = parseJsonArray<ServiceQuestion>(serviceDraft.questions, 'Questions');
    } catch (error) {
      setActionError(formError(error));
      return;
    }

    const payload: ServiceCreate = {
      category_slug: serviceDraft.category_slug,
      slug: serviceDraft.slug.trim(),
      title: serviceDraft.title.trim(),
      home_title: serviceDraft.home_title.trim(),
      home_description: serviceDraft.home_description.trim(),
      description: serviceDraft.description.trim(),
      listing_description: serviceDraft.listing_description.trim(),
      keywords: listFromLines(serviceDraft.keywords),
      common_problems: commonProblems,
      inspection_scope: listFromLines(serviceDraft.inspection_scope),
      questions,
      related_service_slugs: listFromLines(serviceDraft.related_service_slugs),
      display_order: displayOrder,
      is_active: serviceDraft.is_active,
    };
    void runAction(
      async () => {
        if (editingServiceId) await updateService(editingServiceId, payload);
        else await createService(payload);
        await reload();
        setEditingServiceId(null);
        setServiceDraft(
          newServiceDraft(catalog.categories.find((category) => category.is_active)?.slug ?? ''),
        );
      },
      editingServiceId ? 'Service guide changes saved.' : 'Service guide created.',
    );
  };

  const updateServiceStatus = (service: AdminServiceGuide, isActive: boolean) => {
    if (
      !isActive &&
      !window.confirm(
        `Deactivate “${service.title}”? It will be hidden from public catalog responses.`,
      )
    )
      return;
    void runAction(
      async () => {
        if (isActive) await updateService(service.id, { is_active: true });
        else await deactivateService(service.id);
        await reload();
      },
      isActive ? 'Service guide published.' : 'Service guide deactivated.',
    );
  };

  const cancelServiceEdit = () => {
    setEditingServiceId(null);
    setServiceDraft(
      newServiceDraft(catalog.categories.find((category) => category.is_active)?.slug ?? ''),
    );
    setActionError('');
  };

  const visibleServices = catalog.services.filter((service) => showInactive || service.is_active);
  const activeCategories = catalog.categories.filter((category) => category.is_active);

  if (catalog.loadState === 'loading') {
    return (
      <>
        <DashboardPageHeader
          eyebrow="Admin · service catalog"
          title="Manage service guides."
          description="Loading the database-backed service catalog."
        />
        <div className="flex min-h-40 items-center gap-3 rounded-2xl border border-midnight/10 bg-white p-6 text-sm text-midnight/65">
          <LoaderCircle
            aria-hidden="true"
            className="animate-spin motion-reduce:animate-none"
            size={18}
          />
          Connecting to the admin catalog API…
        </div>
      </>
    );
  }

  if (catalog.loadState !== 'ready') {
    return (
      <>
        <DashboardPageHeader
          eyebrow="Admin · service catalog"
          title="Manage service guides."
          description="This screen reads and writes database catalog data. No local sample categories or services are presented as live records."
        />
        <DashboardCard
          title="Admin access required"
          description={catalog.message}
          icon={CircleAlert}
        >
          <p className="text-sm leading-6 text-midnight/65">
            Only an authenticated user with a server-managed admin role can access catalog
            operations.
          </p>
          <Link
            href="/services"
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-midnight px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
          >
            View public service guides <ArrowUpRight aria-hidden="true" size={15} />
          </Link>
        </DashboardCard>
      </>
    );
  }

  return (
    <>
      <DashboardPageHeader
        eyebrow="Admin · database-backed catalog"
        title="Manage service guides."
        description="Create, edit, publish or deactivate categories and guide content. Public clients see active services only. This catalog has no price, booking or technician-availability fields."
      />

      {actionError ? (
        <p
          role="alert"
          className="mb-5 rounded-xl border border-[#e9b8b2] bg-[#fff3f1] px-4 py-3 text-sm text-[#8d3028]"
        >
          {actionError}
        </p>
      ) : null}
      {feedback ? (
        <p
          role="status"
          aria-live="polite"
          className="mb-5 rounded-xl bg-[#eef7e5] px-4 py-3 text-sm text-midnight"
        >
          {feedback}
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="grid content-start gap-5">
          <DashboardCard
            title={editingCategoryId ? 'Edit category' : 'Add a category'}
            description="Categories organize service guides and can be temporarily deactivated without deleting their records."
            icon={Tags}
          >
            <form onSubmit={submitCategory} className="grid gap-4">
              <TextInput
                id={`${categoryFormId}-slug`}
                label="Category slug"
                value={categoryDraft.slug}
                onChange={(value) => setCategoryDraft((current) => ({ ...current, slug: value }))}
                required
              />
              <TextInput
                id={`${categoryFormId}-title`}
                label="Category title"
                value={categoryDraft.title}
                onChange={(value) => setCategoryDraft((current) => ({ ...current, title: value }))}
                required
              />
              <AdminTextarea
                id={`${categoryFormId}-description`}
                label="Description"
                value={categoryDraft.description}
                onChange={(value) =>
                  setCategoryDraft((current) => ({ ...current, description: value }))
                }
                rows={3}
              />
              <TextInput
                id={`${categoryFormId}-order`}
                label="Display order"
                type="number"
                min={0}
                value={categoryDraft.display_order}
                onChange={(value) =>
                  setCategoryDraft((current) => ({ ...current, display_order: value }))
                }
                required
              />
              <div className="flex flex-wrap justify-end gap-2 border-t border-midnight/8 pt-4">
                {editingCategoryId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCategoryId(null);
                      setCategoryDraft(newCategoryDraft());
                    }}
                    className="min-h-11 rounded-xl border border-midnight/15 px-4 text-sm font-semibold text-midnight"
                  >
                    Cancel
                  </button>
                ) : null}
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-midnight px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {editingCategoryId ? (
                    <Save aria-hidden="true" size={15} />
                  ) : (
                    <Plus aria-hidden="true" size={15} />
                  )}
                  {busy ? 'Saving…' : editingCategoryId ? 'Save category' : 'Create category'}
                </button>
              </div>
            </form>
          </DashboardCard>

          <DashboardCard
            title="Categories"
            description={`${catalog.categories.length} database-backed categories`}
            icon={Tags}
          >
            {catalog.categories.length === 0 ? (
              <p className="rounded-xl border border-dashed border-midnight/15 bg-[#f8faf7] p-4 text-sm text-midnight/60">
                No service categories have been created.
              </p>
            ) : (
              <ul className="grid gap-3">
                {catalog.categories.map((category) => (
                  <li
                    key={category.id}
                    className="rounded-xl border border-midnight/10 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="break-words text-sm font-semibold text-midnight">
                            {category.title}
                          </h3>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[0.65rem] font-semibold ${category.is_active ? 'bg-[#edf6e4] text-midnight' : 'bg-[#f1f3f5] text-midnight/55'}`}
                          >
                            {category.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-midnight/50">
                          {category.slug} · order {category.display_order}
                        </p>
                        {category.description ? (
                          <p className="mt-2 text-xs leading-5 text-midnight/65">
                            {category.description}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => startCategoryEdit(category)}
                        className="min-h-10 shrink-0 rounded-lg px-3 text-xs font-semibold text-midnight underline underline-offset-4"
                      >
                        Edit
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => updateCategoryStatus(category, !category.is_active)}
                      className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-midnight/65 underline underline-offset-4 disabled:opacity-50"
                    >
                      {category.is_active ? (
                        <Archive aria-hidden="true" size={13} />
                      ) : (
                        <Undo2 aria-hidden="true" size={13} />
                      )}
                      {category.is_active ? 'Deactivate category' : 'Restore category'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </DashboardCard>
        </div>

        <div className="grid content-start gap-5">
          <DashboardCard
            title={editingServiceId ? 'Edit service guide' : 'Add a service guide'}
            description="Guide content is descriptive only. Do not add unsupported prices, live technician availability or verification claims."
            icon={BookOpenText}
          >
            <form id={serviceFormId} onSubmit={submitService} className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid min-w-0 gap-1.5">
                  <label
                    htmlFor={`${serviceFormId}-category`}
                    className="text-sm font-semibold text-midnight"
                  >
                    Category
                  </label>
                  <select
                    id={`${serviceFormId}-category`}
                    required
                    value={serviceDraft.category_slug}
                    onChange={(event) =>
                      setServiceDraft((current) => ({
                        ...current,
                        category_slug: event.currentTarget.value,
                      }))
                    }
                    className="min-h-12 w-full rounded-xl border border-midnight/15 bg-white px-3.5 text-sm text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
                  >
                    <option value="">Choose a category</option>
                    {catalog.categories.map((category) => (
                      <option key={category.id} value={category.slug}>
                        {category.title}
                        {category.is_active ? '' : ' · inactive'}
                      </option>
                    ))}
                  </select>
                  {activeCategories.length === 0 ? (
                    <p className="text-xs text-[#943329]">
                      Create or restore a category before publishing a service.
                    </p>
                  ) : null}
                </div>
                <TextInput
                  id={`${serviceFormId}-slug`}
                  label="Service slug"
                  value={serviceDraft.slug}
                  onChange={(value) => setServiceDraft((current) => ({ ...current, slug: value }))}
                  required
                  helperText="Lowercase letters, numbers and hyphens."
                />
                <TextInput
                  id={`${serviceFormId}-title`}
                  label="Service title"
                  value={serviceDraft.title}
                  onChange={(value) => setServiceDraft((current) => ({ ...current, title: value }))}
                  required
                />
                <TextInput
                  id={`${serviceFormId}-home-title`}
                  label="Home-card title"
                  value={serviceDraft.home_title}
                  onChange={(value) =>
                    setServiceDraft((current) => ({ ...current, home_title: value }))
                  }
                  required
                />
                <TextInput
                  id={`${serviceFormId}-home-description`}
                  label="Home-card description"
                  value={serviceDraft.home_description}
                  onChange={(value) =>
                    setServiceDraft((current) => ({ ...current, home_description: value }))
                  }
                />
                <TextInput
                  id={`${serviceFormId}-order`}
                  label="Display order"
                  type="number"
                  min={0}
                  value={serviceDraft.display_order}
                  onChange={(value) =>
                    setServiceDraft((current) => ({ ...current, display_order: value }))
                  }
                  required
                />
              </div>
              <AdminTextarea
                id={`${serviceFormId}-description`}
                label="Guide description"
                value={serviceDraft.description}
                onChange={(value) =>
                  setServiceDraft((current) => ({ ...current, description: value }))
                }
                rows={4}
                required
              />
              <AdminTextarea
                id={`${serviceFormId}-listing`}
                label="Listing description"
                value={serviceDraft.listing_description}
                onChange={(value) =>
                  setServiceDraft((current) => ({ ...current, listing_description: value }))
                }
                rows={3}
                required
              />
              <AdminTextarea
                id={`${serviceFormId}-keywords`}
                label="Search keywords"
                value={serviceDraft.keywords}
                onChange={(value) =>
                  setServiceDraft((current) => ({ ...current, keywords: value }))
                }
                helperText="One keyword per line; commas are also accepted."
              />
              <AdminTextarea
                id={`${serviceFormId}-problems`}
                label="Common problems · JSON array"
                value={serviceDraft.common_problems}
                onChange={(value) =>
                  setServiceDraft((current) => ({ ...current, common_problems: value }))
                }
                rows={6}
                helperText={'Example: [{"title":"Not cooling","description":"Room stays warm."}]'}
              />
              <AdminTextarea
                id={`${serviceFormId}-scope`}
                label="Inspection scope"
                value={serviceDraft.inspection_scope}
                onChange={(value) =>
                  setServiceDraft((current) => ({ ...current, inspection_scope: value }))
                }
                helperText="One general scope statement per line."
              />
              <AdminTextarea
                id={`${serviceFormId}-questions`}
                label="Questions and answers · JSON array"
                value={serviceDraft.questions}
                onChange={(value) =>
                  setServiceDraft((current) => ({ ...current, questions: value }))
                }
                rows={6}
                helperText={
                  'Example: [{"question":"What should I share?","answer":"Describe the symptom."}]'
                }
              />
              <AdminTextarea
                id={`${serviceFormId}-related`}
                label="Related service slugs"
                value={serviceDraft.related_service_slugs}
                onChange={(value) =>
                  setServiceDraft((current) => ({ ...current, related_service_slugs: value }))
                }
                helperText="One existing service slug per line."
              />
              <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-midnight">
                <input
                  type="checkbox"
                  checked={serviceDraft.is_active}
                  onChange={(event) =>
                    setServiceDraft((current) => ({
                      ...current,
                      is_active: event.currentTarget.checked,
                    }))
                  }
                  className="size-5 accent-[#101827]"
                />
                Publish in the public catalog
              </label>
              <div className="flex flex-col-reverse gap-2 border-t border-midnight/8 pt-4 sm:flex-row sm:justify-end">
                {editingServiceId ? (
                  <button
                    type="button"
                    onClick={cancelServiceEdit}
                    className="min-h-11 rounded-xl border border-midnight/15 px-4 text-sm font-semibold text-midnight"
                  >
                    Cancel edit
                  </button>
                ) : null}
                <button
                  type="submit"
                  disabled={busy || catalog.categories.length === 0}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-midnight px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <Save aria-hidden="true" size={15} />{' '}
                  {busy
                    ? 'Saving…'
                    : editingServiceId
                      ? 'Save service guide'
                      : 'Create service guide'}
                </button>
              </div>
            </form>
          </DashboardCard>

          <DashboardCard
            title="Service guides"
            description={`${catalog.services.length} database-backed records`}
            icon={BookOpenText}
          >
            <label className="mb-4 flex min-h-10 items-center gap-2 text-xs font-medium text-midnight/65">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(event) => setShowInactive(event.currentTarget.checked)}
                className="size-4 accent-[#101827]"
              />
              Include inactive guides
            </label>
            {visibleServices.length === 0 ? (
              <p className="rounded-xl border border-dashed border-midnight/15 bg-[#f8faf7] p-4 text-sm text-midnight/60">
                No service guides match this view.
              </p>
            ) : (
              <ul className="grid gap-3">
                {visibleServices.map((service) => (
                  <li
                    key={service.id}
                    className="rounded-xl border border-midnight/10 bg-white p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="break-words text-sm font-semibold text-midnight">
                            {service.title}
                          </h3>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[0.65rem] font-semibold ${service.is_active ? 'bg-[#edf6e4] text-midnight' : 'bg-[#f1f3f5] text-midnight/55'}`}
                          >
                            {service.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-midnight/50">
                          {service.slug} · {service.category.title} · order {service.display_order}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-midnight/65">
                          {service.listing_description}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => startServiceEdit(service)}
                        className="min-h-10 w-fit shrink-0 rounded-lg px-3 text-xs font-semibold text-midnight underline underline-offset-4"
                      >
                        Edit guide
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => updateServiceStatus(service, !service.is_active)}
                      className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-midnight/65 underline underline-offset-4 disabled:opacity-50"
                    >
                      {service.is_active ? (
                        <Archive aria-hidden="true" size={13} />
                      ) : (
                        <Undo2 aria-hidden="true" size={13} />
                      )}
                      {service.is_active ? 'Deactivate guide' : 'Publish guide'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </DashboardCard>

          <p className="flex items-start gap-2 text-xs leading-5 text-midnight/50">
            <Database aria-hidden="true" className="mt-0.5 shrink-0" size={14} />
            Changes are stored through admin-only endpoints. Deactivation is reversible and public
            reads remain active-only.
          </p>
        </div>
      </div>
    </>
  );
}
