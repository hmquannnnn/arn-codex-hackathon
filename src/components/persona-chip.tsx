'use client';
import { useEffect, useMemo, useState } from 'react';
import type { PersonaResponse } from '@/contract/types';
import { HttpKitApi, MockKitApi, type KitApi } from '@/lib/client/kit-api';
export function PersonaChip({
  api: supplied,
  insideKit = false,
  onChange,
}: {
  api?: Pick<KitApi, 'getPersona' | 'setPersona'>;
  insideKit?: boolean;
  onChange?: (data: PersonaResponse) => void;
}) {
  const api = useMemo(
    () =>
      supplied ||
      (process.env.NEXT_PUBLIC_KITLY_MOCK === '1'
        ? new MockKitApi()
        : new HttpKitApi()),
    [supplied],
  );
  const [data, setData] = useState<PersonaResponse>();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api
      .getPersona()
      .then((result) => {
        if (active) {
          setData(result);
          onChange?.(result);
        }
      })
      .catch(() => {
        if (active) setError('Profile unavailable');
      });
    return () => {
      active = false;
    };
  }, [api, onChange]);
  const p = data?.persona;
  return (
    <div className="relative max-w-full text-xs">
      <button
        disabled={busy || !p}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="max-w-full rounded-full border bg-white px-3 py-2 text-left disabled:opacity-50"
      >
        {p
          ? `👤 ${p.name}${p.address ? ` · ${p.address.district}, ${p.address.city} · ${data!.walletVouchers.length} vouchers` : ''}`
          : 'Loading profile…'}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 min-w-48 rounded-xl border bg-white p-3 shadow-lg">
          <div role="menu" className="space-y-1">
            {(['lan', 'guest'] as const).map((id) => (
              <button
                role="menuitem"
                key={id}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    const result = await api.setPersona(id);
                    setData(result);
                    onChange?.(result);
                    setOpen(false);
                  } catch {
                    setError('Could not change profile. Try again.');
                  } finally {
                    setBusy(false);
                  }
                }}
                className="block w-full rounded-lg px-3 py-2 text-left capitalize hover:bg-orange-50"
              >
                {id === 'lan' ? 'Lan' : 'Guest'}
              </button>
            ))}
          </div>
          {insideKit && (
            <div className="mt-2 border-t pt-2 text-slate-500">
              <p>Applies to new kits</p>
              <a href="/kit/new" className="mt-2 block text-accent">
                + New kit
              </a>
            </div>
          )}
        </div>
      )}
      {insideKit && !open && (
        <span className="sr-only">Applies to new kits</span>
      )}
      {error && (
        <p role="alert" className="mt-1 text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
