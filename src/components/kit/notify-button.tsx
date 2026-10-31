'use client';
import { useState } from 'react';
import { subscribeToNeed } from '@/lib/client/seller-api';
export function NotifyButton({
  gapKey,
  subscribe = subscribeToNeed,
}: {
  gapKey: string;
  subscribe?: (key: string) => Promise<{ watchers: number }>;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  return (
    <span className="mt-2 inline-block">
      <button
        disabled={busy || done}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await subscribe(gapKey);
            setDone(true);
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : 'Could not subscribe. Try again.',
            );
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-lg border bg-white px-3 py-2 text-xs text-slate-700 disabled:opacity-50"
      >
        {done ? 'You’re on the list' : busy ? 'Saving…' : 'Notify me'}
      </button>
      {error && (
        <span role="alert" className="ml-2 text-xs text-red-700">
          {error}
        </span>
      )}
    </span>
  );
}
