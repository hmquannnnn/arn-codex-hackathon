'use client';
import { useLayoutEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { ArrowUp, History, Plus, Sparkles, X } from 'lucide-react';
import { HttpKitApi, MockKitApi, type KitApi } from '@/lib/client/kit-api';
import { relativeDate } from '@/lib/client/kit-text';
import { Conversation } from './conversation';
import { useKitController } from './use-kit-controller';
import { kitThreadPath } from '@/lib/client/cart-flow';
import { CartKitIntro } from './cart-intro';
import { CartKitSetup } from './cart-setup';
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
export function KitScreen(props: Parameters<typeof KitWorkspace>[0]) {
  return <KitWorkspace {...props} initialSource="catalog" />;
}
export function KitWorkspace({
  api: supplied,
  id,
  query = '',
  initialSource = 'catalog',
  today = '2026-09-02',
  onNavigate,
}: {
  api?: KitApi;
  id?: string;
  query?: string;
  initialSource?: 'catalog' | 'cart_only';
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
        initialSource={initialSource}
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
  initialSource,
  today,
  onNavigate,
}: {
  api: KitApi;
  id?: string;
  query: string;
  initialSource: 'catalog' | 'cart_only';
  today: string;
  onNavigate?: (url: string) => void;
}) {
  const {
    cart,
    source,
    setSource,
    keepProductIds,
    setKeepProductIds,
    persona,
    setPersona,
    setPersonaBusy,
    setVisibleProfile,
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
  } = useKitController({ api, id, query, initialSource, today, onNavigate });
  const cartMode = initialSource === 'cart_only';
  const newKitPath = cartMode ? '/cart/kit/new' : '/kit/new';
  const chatScroll = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const lastRun = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    const token = runs.at(-1)?.token;
    if (token !== undefined && token !== lastRun.current) pinned.current = true;
    lastRun.current = token;
    const node = chatScroll.current;
    if (node && pinned.current) node.scrollTop = node.scrollHeight;
  }, [runs, savedVersions, messages, actions, loading, mobile]);
  return (
    <div
      className={`flex flex-col bg-white ${cartMode ? 'h-[80dvh] min-h-[600px] overflow-hidden rounded-2xl border' : 'h-dvh'}`}
    >
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
            href={newKitPath}
            className="flex items-center gap-2 text-lg font-bold"
          >
            <Sparkles size={21} className="text-accent" />
            {cartMode ? 'Cart kit' : 'Kitly'}
          </Link>
          {process.env.NEXT_PUBLIC_KITLY_MOCK === '1' && (
            <span className="rounded-full bg-orange-50 px-2 py-1 text-[10px] text-orange-700">
              Fixture replay
            </span>
          )}
        </div>
        {!cartMode && (
          <PersonaChip
            api={api}
            insideKit
            onChange={setPersona}
            onPendingChange={setPersonaBusy}
          />
        )}
        <Link
          href={cartMode ? '/cart' : '/'}
          className="text-xs text-slate-500"
        >
          {cartMode ? '← Back to cart' : '← Back to DemoMart'}
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
              href={newKitPath}
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
            {history.map((h) => {
              const count =
                h.id === threadId.current
                  ? Math.max(h.versionCount, versions.at(-1)?.version ?? 0)
                  : h.versionCount;
              return (
                <a
                  href={kitThreadPath(
                    h.id,
                    h.id === threadId.current ? initialSource : 'catalog',
                  )}
                  key={h.id}
                  className={`block rounded-xl p-3 ${h.id === threadId.current ? 'bg-orange-100' : 'hover:bg-slate-100'}`}
                >
                  <p className="line-clamp-2 text-sm font-medium">{h.title}</p>
                  <p className="mt-2 text-[10px] text-slate-500">
                    {relativeDate(h.updatedAt, today)} · {count}{' '}
                    {count === 1 ? 'version' : 'versions'}
                  </p>
                </a>
              );
            })}
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
          <div
            ref={chatScroll}
            onScroll={(event) => {
              const node = event.currentTarget;
              pinned.current =
                node.scrollHeight - node.scrollTop - node.clientHeight <= 64;
            }}
            className="flex-1 overflow-y-auto p-5 lg:p-8"
          >
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
                  <a href={newKitPath} className="ml-2 underline">
                    New kit
                  </a>
                )}
              </div>
            )}
            {!savedVersions.length &&
              !runs.length &&
              !loading &&
              !id &&
              !cartMode && (
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
            {!threadId.current && !busy && cartMode && !loading && (
              <CartKitIntro
                lines={cart.lines}
                keepProductIds={keepProductIds}
                onKeep={setKeepProductIds}
              />
            )}
            {!threadId.current && !busy && !cartMode && (
              <CartKitSetup
                lines={cart.lines}
                source={source}
                keepProductIds={keepProductIds}
                onSource={(source) => {
                  if (source === 'cart_only')
                    window.location.assign('/cart/kit/new');
                  else setSource(source);
                }}
                onKeep={setKeepProductIds}
              />
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
                    : cartMode
                      ? 'What would you like to buy from your cart? What’s your budget?'
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
                disabled={
                  busy ||
                  loading ||
                  notFound ||
                  (cartMode && !cart.lines.length)
                }
                rows={2}
                className="min-w-0 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none"
              />
              <button
                aria-label="Send message"
                disabled={
                  busy ||
                  loading ||
                  notFound ||
                  !text.trim() ||
                  (cartMode && !cart.lines.length)
                }
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
            cartLines={cart.lines}
            onProfileChange={setVisibleProfile}
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
