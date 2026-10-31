'use client';
import { useEffect } from 'react';
import type { EnrichmentPreviewResponse } from '@/contract/types';
export function PreviewDrawer({
  preview,
  busy,
  onClose,
  onApply,
  error,
}: {
  preview: EnrichmentPreviewResponse;
  busy: boolean;
  onClose: () => void;
  onApply: () => void;
  error?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);
  const all = preview.keywordCheck.every((k) => k.stillMatches);
  return (
    <div className="fixed inset-0 z-50 bg-black/25">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-heading"
        className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 id="preview-heading" className="text-xl font-bold">
            Preview listing fix
          </h2>
          <button
            autoFocus
            disabled={busy}
            aria-label="Close preview"
            onClick={onClose}
            className="rounded-lg border px-3 py-2"
          >
            ✕
          </button>
        </div>
        <div>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
        <p className="mt-3 text-sm text-slate-500">
          Adds supported details while keeping your existing listing.
        </p>
        <h3 className="mt-6 text-sm font-semibold">Before title</h3>
        <p className="mt-2 text-sm">{preview.before.title}</p>
        <h3 className="mt-5 text-sm font-semibold">After title</h3>
        <p className="mt-2 rounded-xl bg-emerald-50 p-3 text-sm">
          {preview.after.title}
        </p>
        <h3 className="mt-5 text-sm font-semibold">Added tags</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {preview.added.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-800"
            >
              {t}
            </span>
          ))}
        </div>
        <h3 className="mt-5 text-sm font-semibold">Kept tags</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {preview.kept.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs"
            >
              {t}
            </span>
          ))}
        </div>
        <h3 className="mt-5 text-sm font-semibold">Added attributes</h3>
        <dl className="mt-2 space-y-2 text-sm">
          {Object.entries(preview.added.attributes).map(([key, value]) => (
            <div key={key} className="flex justify-between gap-4 border-b py-2">
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <h3 className="mt-5 text-sm font-semibold">Appended description</h3>
        <p className="mt-2 rounded-xl bg-emerald-50 p-3 text-sm leading-6">
          {preview.added.descriptionAppend}
        </p>
        <h3 className="mt-5 text-sm font-semibold">Evidence</h3>
        <blockquote className="mt-2 text-sm leading-6 text-slate-600">
          {preview.evidence}
        </blockquote>
        <h3 className="mt-5 font-semibold">
          Old keywords still match {all ? '✓' : '✗'}
        </h3>
        <ul className="mt-2 flex flex-wrap gap-2">
          {preview.keywordCheck.map((k, i) => (
            <li
              key={i}
              className={`rounded-lg px-2 py-1 text-xs ${k.stillMatches ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}
            >
              {k.keyword} {k.stillMatches ? '✓' : '✗'}
            </li>
          ))}
        </ul>
        <button
          disabled={busy}
          onClick={onApply}
          className="mt-7 w-full rounded-xl bg-accent p-3 font-semibold text-white disabled:opacity-40"
        >
          {busy ? 'Applying…' : 'Apply enrichment'}
        </button>
      </section>
    </div>
  );
}
