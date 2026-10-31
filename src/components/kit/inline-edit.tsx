'use client';
import { useState } from 'react';
import { Pencil } from 'lucide-react';
export function InlineEdit({
  label,
  value,
  display,
  type = 'text',
  disabled,
  onSave,
}: {
  label: string;
  value: string;
  display: React.ReactNode;
  type?: 'text' | 'number' | 'date';
  disabled?: boolean;
  onSave: (value: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  async function save() {
    if (disabled) return;
    if (
      type === 'number' &&
      draft !== '' &&
      (!/^\d+$/.test(draft) || !Number.isSafeInteger(Number(draft)))
    ) {
      setError('Enter a whole amount in VND.');
      return;
    }
    if (type === 'text' && !draft.trim()) {
      setError('Please enter a value.');
      return;
    }
    try {
      await onSave(draft.trim());
      setEditing(false);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save');
    }
  }
  if (!editing)
    return (
      <button
        type="button"
        disabled={disabled}
        aria-label={`Edit ${label}`}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="inline-flex items-center gap-1 rounded-lg px-1 py-1 text-left hover:bg-orange-50 disabled:opacity-50"
      >
        {display}
        <Pencil size={11} className="shrink-0 text-slate-400" />
      </button>
    );
  const inputLabel =
    type === 'number'
      ? 'Budget in VND'
      : type === 'date'
        ? 'Delivery deadline'
        : 'Assumption';
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1">
      <input
        autoFocus
        aria-label={inputLabel}
        type={type}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? 1 : undefined}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void save();
          }
          if (e.key === 'Escape') {
            setEditing(false);
            setError('');
          }
        }}
        className="min-w-0 max-w-full rounded border bg-white px-2 py-1 text-xs"
      />
      <button
        disabled={disabled}
        onClick={() => void save()}
        className="text-xs text-accent"
      >
        Save
      </button>
      <button
        disabled={disabled}
        onClick={() => setEditing(false)}
        className="text-xs text-slate-500"
      >
        Cancel
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-700">
          {error}
        </span>
      )}
    </span>
  );
}
