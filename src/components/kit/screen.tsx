'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowUp, History, Plus, Sparkles, X } from 'lucide-react';
import { HttpKitApi, MockKitApi, type KitApi } from '@/lib/client/kit-api';
import { relativeDate } from '@/lib/client/kit-text';
import { Conversation } from './conversation';
import { useKitController } from './use-kit-controller';
import { KitPanel } from './panel';
import { PersonaChip } from '@/components/persona-chip';
import { CartProvider } from '@/components/store/cart-context';
const examples = [
  'My kid starts Grade 1. Budget 1.5M VND. The backpack must be anti-hunchback, under 400k.',
  'Newborn essentials, budget 2M VND.',
  'Moving into my first apartment, budget 5M.',
  'Camping this weekend, budget 3M.',
  'Set up a home office, budget 4M.',
  'Tet gifts for my family, budget 2M.',
];
export function KitScreen({
  api: supplied,
  id,
  query = '',
  today = '2026-09-02',
  onNavigate,
}: {
  api?: KitApi;
  id?: string;
  query?: string;
  today?: string;
  onNavigate?: (url: string) => void;
}) {
  const api = useMemo(
    () =>
      supplied ||
      (process.env.NEXT_PUBLIC_KITLY_MOCK === '1'
        ? new MockKitApi()
        : new HttpKitApi()),
    [supplied],
  );
  return (
    <CartProvider>
      <Workspace
        api={api}
        id={id}
        query={query}
        today={today}
        onNavigate={onNavigate}
      />
    </CartProvider>
  );
}
function Workspace({
  api,
  id,
  query,
  today,
  onNavigate,
}: {
  api: KitApi;
  id?: string;
  query: string;
  today: string;
  onNavigate?: (url: string) => void;
}) {
  const {
    persona,
    setPersona,
    actions,
    messages,
    chooseSuggestion,
    boundPersona,
    drawer,
    setDrawer,
    sidebar,
    setSidebar,
    mobile,
    setMobile,
    history,
    threadId,
    error,
    notFound,
    loading,
    savedVersions,
    runs,
    busy,
    send,
    adjust,
    text,
    setText,
    version,
    versions,
    setSelectedVersion,
    swap,
    priceSelection,
    undoPrice,
    canUndoPrice,
    add,
  } = useKitController({ api, id, query, today, onNavigate });
  return (
    <div className="flex h-dvh flex-col bg-white">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <button
            aria-label="Toggle history"
            onClick={() => {
              setDrawer(!drawer);
              setSidebar(!sidebar);
            }}
            className="rounded-lg p-2 hover:bg-slate-50"
          >
            <History size={19} />
          </button>
          <Link
            href="/kit/new"
            className="flex items-center gap-2 text-lg font-bold"
          >
            <Sparkles size={21} className="text-accent" />
            Kitly
          </Link>
          {process.env.NEXT_PUBLIC_KITLY_MOCK === '1' && (
            <span className="rounded-full bg-orange-50 px-2 py-1 text-[10px] text-orange-700">
              Fixture replay
            </span>
          )}
        </div>
        <PersonaChip api={api} insideKit onChange={setPersona} />
        <Link href="/" className="text-xs text-slate-500">
          ← Back to DemoMart
        </Link>
      </header>
      <div className="flex border-b md:hidden">
        <button
          onClick={() => setMobile('chat')}
          aria-pressed={mobile === 'chat'}
          className={`flex-1 p-3 text-sm ${mobile === 'chat' ? 'font-bold text-accent' : ''}`}
        >
          Chat
        </button>
        <button
          onClick={() => setMobile('kit')}
          aria-pressed={mobile === 'kit'}
          className={`flex-1 p-3 text-sm ${mobile === 'kit' ? 'font-bold text-accent' : ''}`}
        >
          Kit
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1">
        {drawer && (
          <button
            aria-label="Close history overlay"
            onClick={() => setDrawer(false)}
            className="absolute inset-0 z-20 bg-black/20 md:hidden"
          />
        )}
        <aside
          aria-label="Kit history"
          className={`${drawer ? 'absolute inset-y-0 left-0 z-30 flex md:static' : 'hidden'} ${sidebar ? 'md:flex' : 'md:hidden'} w-60 shrink-0 flex-col border-r bg-slate-50 p-4`}
        >
          <div className="mb-5 flex items-center justify-between">
            <a
              href="/kit/new"
              className="flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-semibold"
            >
              <Plus size={16} />
              New kit
            </a>
            <button
              aria-label="Close history"
              onClick={() => {
                setDrawer(false);
                setSidebar(false);
              }}
            >
              <X size={16} />
            </button>
          </div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Your kits
          </p>
          <nav className="space-y-2 overflow-y-auto">
            {history.map((h) => (
              <a
                href={`/kit/t/${h.id}`}
                key={h.id}
                className={`block rounded-xl p-3 ${h.id === threadId.current ? 'bg-orange-100' : 'hover:bg-slate-100'}`}
              >
                <p className="line-clamp-2 text-sm font-medium">{h.title}</p>
                <p className="mt-2 text-[10px] text-slate-500">
                  {relativeDate(h.updatedAt, today)} · {h.versionCount} versions
                </p>
              </a>
            ))}
            {!history.length && (
              <p className="text-xs leading-5 text-slate-400">
                Your plans will be saved here, ready whenever you are.
              </p>
            )}
          </nav>
        </aside>
        <section
          aria-label="Chat"
          className={`${mobile === 'chat' ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col md:flex`}
        >
          <div className="flex-1 overflow-y-auto p-5 lg:p-8">
            {loading && (
              <p role="status" className="text-sm text-slate-500">
                Loading your kit…
              </p>
            )}
            {error && (
              <div
                role="alert"
                className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800"
              >
                {notFound
                  ? 'Kit not found. It may belong to another browser.'
                  : error}
                {notFound && (
                  <a href="/kit/new" className="ml-2 underline">
                    New kit
                  </a>
                )}
              </div>
            )}
            {!savedVersions.length && !runs.length && !loading && !id && (
              <div className="mx-auto max-w-lg py-8">
                <Sparkles className="text-accent" size={32} />
                <h1 className="mt-5 text-3xl font-bold">
                  What are you getting ready for?
                </h1>
                <p className="mt-4 text-sm leading-6 text-slate-500">
                  Tell me your plan, budget and what matters most. I’ll bring
                  everything together.
                </p>
                <div className="mt-6 grid gap-2">
                  {examples.map((example) => (
                    <button
                      key={example}
                      disabled={busy}
                      onClick={() => void send(example)}
                      className="rounded-xl border p-3 text-left text-xs leading-5 hover:border-orange-300"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Conversation
              versions={savedVersions}
              messages={messages}
              actions={actions}
              onSuggestion={(suggestion) => void chooseSuggestion(suggestion)}
              live={runs}
              disabled={busy}
              onBudget={(budget) => void adjust({ type: 'set_budget', budget })}
              onRetry={(message) => void send(message)}
              onRefine={(message) => void send(message)}
              onUndoRemove={(itemKey) =>
                void adjust({ type: 'restore_item', itemKey })
              }
            />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
            className="border-t bg-white p-4"
          >
            <div className="flex items-end gap-2 rounded-2xl border bg-slate-50 p-2">
              <textarea
                aria-label="Message Kitly"
                placeholder={
                  threadId.current
                    ? 'Tell Kitly what to change…'
                    : 'Describe your need. What’s your budget?'
                }
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    void send(text);
                  }
                }}
                disabled={busy || loading || notFound}
                rows={2}
                className="min-w-0 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none"
              />
              <button
                aria-label="Send message"
                disabled={busy || loading || notFound || !text.trim()}
                className="rounded-xl bg-accent p-3 text-white disabled:opacity-30"
              >
                <ArrowUp size={18} />
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] text-slate-400">
              Every change is a version. You’re always in control.
            </p>
          </form>
        </section>
        <section
          aria-label="Kit"
          className={`${mobile === 'kit' ? 'block' : 'hidden'} min-w-0 overflow-y-auto border-l bg-slate-50/50 md:block md:w-[48%] xl:w-[52%]`}
        >
          <KitPanel
            version={version}
            versions={versions}
            busy={busy}
            onVersion={setSelectedVersion}
            onRestore={(n) =>
              void adjust({ type: 'restore_version', version: n })
            }
            deliveryAddress={
              boundPersona === 'lan'
                ? persona?.persona.id === 'lan' && persona.persona.address
                  ? `${persona.persona.address.district}, ${persona.persona.address.city}`
                  : 'Cau Giay, Hanoi'
                : undefined
            }
            guest={boundPersona === 'guest'}
            onSwap={swap}
            onSelect={priceSelection}
            onUndoPrice={undoPrice}
            canUndoPrice={canUndoPrice}
            onRemove={(itemKey) =>
              void adjust({ type: 'remove_item', itemKey })
            }
            onAdjust={adjust}
            onAdd={add}
          />
        </section>
      </div>
    </div>
  );
}
