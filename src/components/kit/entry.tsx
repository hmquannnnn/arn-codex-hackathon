'use client';
import { PersonaChip } from '@/components/persona-chip';
import { useEffect, useState } from 'react';
import { HttpKitApi, MockKitApi } from '@/lib/client/kit-api';
export function KitEntry() {
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const api =
      process.env.NEXT_PUBLIC_KITLY_MOCK === '1'
        ? new MockKitApi()
        : new HttpKitApi();
    api
      .listThreads()
      .then(({ threads }) => {
        if (active)
          window.location.replace(
            threads[0] ? `/kit/t/${threads[0].id}` : '/kit/new',
          );
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <main className="mx-auto max-w-lg p-10">
      <PersonaChip insideKit />
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <a href="/kit/new" className="mt-3 inline-block text-accent">
            Start a new kit →
          </a>
        </div>
      ) : (
        <p role="status">Opening your latest kit…</p>
      )}
    </main>
  );
}
