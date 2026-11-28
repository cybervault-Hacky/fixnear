'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { CloudOff, FileText, LoaderCircle, Trash2, Upload } from 'lucide-react';

import { DashboardCard } from '@/features/dashboard/components/DashboardCard';
import { DashboardEmptyState } from '@/features/dashboard/components/DashboardEmptyState';
import { DashboardPageHeader } from '@/features/dashboard/components/DashboardPageHeader';
import {
  bytesToHuman,
  createDocumentUploadIntent,
  deleteDocument,
  listAppliances,
  listDocuments,
  listWarranties,
} from '@/lib/api/homepassport';
import type { Appliance, ApplianceDocument, Warranty } from '@/lib/api/homepassport';
import {
  LoadingNotice,
  messageForPassportError,
  Notice,
  labelClass,
  selectClass,
} from './passport-ui';

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'JPEG image',
  'image/png': 'PNG image',
  'image/webp': 'WebP image',
  'application/pdf': 'PDF document',
};
const MAX_BYTES = 10 * 1024 * 1024;

const documentTypeLabels: Record<ApplianceDocument['document_type'], string> = {
  purchase_invoice: 'Purchase invoice',
  warranty_certificate: 'Warranty certificate',
  repair_report: 'Repair report',
  service_invoice: 'Service invoice',
  parts_receipt: 'Parts receipt',
  photo: 'Photo',
  other: 'Other document',
};

export function DocumentsPage() {
  const [documents, setDocuments] = useState<ApplianceDocument[]>([]);
  const [uploadAvailable, setUploadAvailable] = useState(false);
  const [appliances, setAppliances] = useState<Appliance[]>([]);
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [documentType, setDocumentType] =
    useState<ApplianceDocument['document_type']>('purchase_invoice');
  const [applianceId, setApplianceId] = useState('');
  const [warrantyId, setWarrantyId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [documentBody, applianceBody, warrantyBody] = await Promise.all([
        listDocuments(),
        listAppliances(false).catch(() => ({ items: [], total: 0 })),
        listWarranties().catch(() => ({ items: [], total: 0 })),
      ]);
      setDocuments(documentBody.items);
      setUploadAvailable(documentBody.upload_available);
      setAppliances(applianceBody.items);
      setWarranties(warrantyBody.items);
    } catch (caught) {
      setError(messageForPassportError(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError(null);
    setSuccess(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (!(selected.type in ALLOWED_TYPES)) {
      setError('Only JPEG, PNG, WebP or PDF files can be stored.');
      event.target.value = '';
      setFile(null);
      return;
    }
    if (selected.size < 1 || selected.size > MAX_BYTES) {
      setError('The file must be between 1 byte and 10 MB.');
      event.target.value = '';
      setFile(null);
      return;
    }
    setFile(selected);
  }

  async function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError('Choose a file to upload.');
      return;
    }
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const intent = await createDocumentUploadIntent({
        document_type: documentType,
        original_filename: file.name,
        content_type: file.type as ApplianceDocument['content_type'],
        size_bytes: file.size,
        appliance_id: applianceId || null,
        warranty_id: warrantyId || null,
      });
      const putResponse = await fetch(intent.upload_url, {
        method: 'PUT',
        headers: intent.headers,
        body: file,
      });
      if (!putResponse.ok) {
        throw new Error(
          'The storage provider refused the upload. The document record stays pending; delete it and try again.',
        );
      }
      setSuccess(`${file.name} uploaded.`);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : messageForPassportError(caught),
      );
      await load();
    } finally {
      setUploading(false);
    }
  }

  async function removeDocument(document: ApplianceDocument) {
    setBusyId(document.id);
    setError(null);
    setSuccess(null);
    try {
      await deleteDocument(document.id);
      setConfirmingDelete(null);
      setSuccess(`${document.original_filename} deleted.`);
      await load();
    } catch (caught) {
      setError(messageForPassportError(caught));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <>
        <DashboardPageHeader
          eyebrow="Documents"
          title="Your document vault."
          description="Loading files linked to your FixNear account."
        />
        <LoadingNotice />
      </>
    );
  }

  return (
    <>
      <DashboardPageHeader
        eyebrow="Documents"
        title="Your document vault."
        description="Purchase invoices, warranty documents, service reports and part receipts linked to your appliances, warranties and claims. Files are never publicly reachable."
      />

      {error ? <Notice kind="error">{error}</Notice> : null}
      {success ? <Notice kind="success">{success}</Notice> : null}

      {!uploadAvailable ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-[#e9d9a6] bg-[#fffbe8] px-5 py-4"
        >
          <CloudOff aria-hidden="true" size={20} className="mt-0.5 shrink-0 text-[#72510b]" />
          <div>
            <p className="text-sm font-semibold text-midnight">Uploads are not configured</p>
            <p className="mt-1 text-sm leading-6 text-midnight/70">
              Document storage (Cloudinary or an S3-compatible bucket) has not been configured for
              this deployment, so no file can be uploaded right now. Existing document records are
              listed below. Configuring storage enables secure direct uploads; until then FixNear
              will not pretend an upload succeeded.
            </p>
          </div>
        </div>
      ) : (
        <DashboardCard
          title="Upload a document"
          description="JPEG, PNG, WebP or PDF, up to 10 MB, linked to an appliance or warranty."
          icon={Upload}
        >
          <form onSubmit={submitUpload} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label className={labelClass} htmlFor="document-type">
                  Document type *
                </label>
                <select
                  id="document-type"
                  className={selectClass}
                  value={documentType}
                  onChange={(event) =>
                    setDocumentType(event.target.value as ApplianceDocument['document_type'])
                  }
                >
                  {(
                    Object.entries(documentTypeLabels) as [
                      ApplianceDocument['document_type'],
                      string,
                    ][]
                  ).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <label className={labelClass} htmlFor="document-appliance">
                  Link to appliance <span className="font-normal text-midnight/45">(optional)</span>
                </label>
                <select
                  id="document-appliance"
                  className={selectClass}
                  value={applianceId}
                  onChange={(event) => setApplianceId(event.target.value)}
                >
                  <option value="">No appliance link</option>
                  {appliances.map((appliance) => (
                    <option key={appliance.id} value={appliance.id}>
                      {appliance.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <label className={labelClass} htmlFor="document-warranty">
                  Link to warranty <span className="font-normal text-midnight/45">(optional)</span>
                </label>
                <select
                  id="document-warranty"
                  className={selectClass}
                  value={warrantyId}
                  onChange={(event) => setWarrantyId(event.target.value)}
                >
                  <option value="">No warranty link</option>
                  {warranties.map((warranty) => (
                    <option key={warranty.id} value={warranty.id}>
                      {warranty.provider} ({warranty.start_date} → {warranty.end_date})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <label className={labelClass} htmlFor="document-file">
                File *
              </label>
              <input
                id="document-file"
                ref={fileInputRef}
                type="file"
                required
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={pickFile}
                className="min-h-11 w-full rounded-xl border border-dashed border-midnight/25 bg-[#f8faf7] px-3 py-2.5 text-sm text-midnight file:mr-3 file:min-h-9 file:rounded-lg file:border-0 file:bg-midnight file:px-3 file:text-xs file:font-semibold file:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
              />
              {file ? (
                <p className="text-xs text-midnight/60">
                  {file.name} · {bytesToHuman(file.size)}
                </p>
              ) : null}
            </div>
            <button
              type="submit"
              disabled={uploading || !file}
              className="inline-flex min-h-12 w-fit items-center gap-2 rounded-xl bg-midnight px-5 text-sm font-semibold text-white hover:bg-[#1d2a3f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight disabled:opacity-50"
            >
              {uploading ? (
                <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <Upload size={16} aria-hidden="true" />
              )}
              {uploading ? 'Uploading…' : 'Upload document'}
            </button>
          </form>
        </DashboardCard>
      )}

      {documents.length === 0 && !error ? (
        <DashboardEmptyState
          icon={FileText}
          title="No documents yet"
          description="When storage is configured, the invoices, certificates and receipts you upload appear here, linked to your appliances, warranties, bookings and claims."
        />
      ) : (
        <ul className="mt-5 grid gap-3">
          {documents.map((document) => (
            <li
              key={document.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-midnight/10 bg-white p-4"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eef2ff] text-[#2f3f8f]"
                >
                  <FileText size={18} strokeWidth={1.8} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-midnight">
                    {document.original_filename}
                  </p>
                  <p className="mt-0.5 text-xs text-midnight/55">
                    {documentTypeLabels[document.document_type]} ·{' '}
                    {bytesToHuman(document.size_bytes)} ·{' '}
                    {document.status === 'uploaded'
                      ? 'Uploaded'
                      : document.status === 'pending_upload'
                        ? 'Awaiting upload'
                        : 'Upload failed'}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {confirmingDelete === document.id ? (
                  <>
                    <span className="text-xs font-medium text-[#8d3028]">Delete?</span>
                    <button
                      type="button"
                      disabled={busyId === document.id}
                      onClick={() => void removeDocument(document)}
                      className="inline-flex min-h-10 items-center rounded-xl border border-[#d99b93] px-3 text-xs font-semibold text-[#8d3028] hover:bg-[#fff3f1] focus-visible:outline-2 focus-visible:outline-midnight disabled:opacity-50"
                    >
                      Confirm delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(null)}
                      className="inline-flex min-h-10 items-center rounded-xl border border-midnight/15 px-3 text-xs font-semibold text-midnight hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-midnight"
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(document.id)}
                    aria-label={`Delete ${document.original_filename}`}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-midnight/50 hover:text-[#8d3028] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
                  >
                    {busyId === document.id ? (
                      <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 size={18} aria-hidden="true" />
                    )}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-xs leading-5 text-midnight/50">
        FixNear stores only document metadata plus an object in configured storage. Storage keys and
        provider URLs are never shown. Document contents are visible to FixNear support only when
        you file a warranty claim that references them. Downloads are not available yet: no signed
        download endpoint or storage-provider integration exists, so a stored file cannot be
        retrieved through this interface — keep the original document in a safe place.
      </p>
    </>
  );
}
