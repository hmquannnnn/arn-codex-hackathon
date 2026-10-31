'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BasketOption,
  KitThreadSummary,
  KitVersion,
  KitSelection,
  Profile,
  ThreadResponse,
  PersonaResponse,
  FollowUp,
} from '@/contract/types';
import type { KitApi } from '@/lib/client/kit-api';
import type { LiveTurn, LocalAction } from './conversation';
import { selectionFor, pickProduct } from '@/lib/client/kit-selection';
import { useCart } from '@/components/store/cart-context';
export function useKitController({
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
  const [thread, setThread] = useState<ThreadResponse | null>(null);
  const [history, setHistory] = useState<KitThreadSummary[]>([]);
  const [runs, setRuns] = useState<LiveTurn[]>([]);
  const [persona, setPersona] = useState<PersonaResponse>();
  const [visibleProfile, setVisibleProfile] = useState<Profile>('balanced');
  const [actions, setActions] = useState<LocalAction[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [mobile, setMobile] = useState<'chat' | 'kit'>('chat');
  const [selectionUndo, setSelectionUndo] = useState<{
    version: number;
    selection: KitSelection;
  }>();
  const [selectedVersion, setSelectedVersion] = useState<number>();
  const threadId = useRef(id);
  const token = useRef(0);
  const active = useRef(true);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const started = useRef(false);
  const cart = useCart();
  const navigate = useCallback(
    (url: string) => {
      if (onNavigate) onNavigate(url);
      else window.history.replaceState(null, '', url);
    },
    [onNavigate],
  );
  const refreshHistory = useCallback(() => {
    api
      .listThreads()
      .then((result) => {
        if (active.current) setHistory(result.threads);
      })
      .catch((e) => {
        if (active.current) setError(e.message);
      });
  }, [api]);
  const applyThread = useCallback(
    (saved: ThreadResponse, completedToken?: number) => {
      if (!active.current || saved.thread.id !== threadId.current) return;
      setThread((previous) =>
        previous &&
        previous.thread.id === saved.thread.id &&
        previous.versions.length > saved.versions.length
          ? previous
          : saved,
      );
      if (completedToken !== undefined)
        setRuns((previous) =>
          previous.filter((run) => run.token > completedToken),
        );
    },
    [],
  );
  const send = useCallback(
    async (message: string) => {
      if (!message.trim() || inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setError('');
      setText('');
      setSelectedVersion(undefined);
      setSelectionUndo(undefined);
      setActions((old) => old.map((a) => ({ ...a, undo: undefined })));
      const runToken = ++token.current;
      const runId = threadId.current;
      const abort = new AbortController();
      controller.current = abort;
      setRuns((old) => [
        ...old.filter((r) => !r.error),
        {
          token: runToken,
          text: message,
          steps: [{ id: 'understand', status: 'running' }],
          explanation: '',
        },
      ]);
      const update = (fn: (run: LiveTurn) => LiveTurn) => {
        if (active.current)
          setRuns((old) =>
            old.map((run) => (run.token === runToken ? fn(run) : run)),
          );
      };
      try {
        for await (const event of api.run(message, runId, abort.signal)) {
          if (!active.current || abort.signal.aborted) return;
          if (event.event === 'step')
            update((run) => ({
              ...run,
              steps: [
                ...run.steps.filter((s) => s.id !== event.data.id),
                event.data,
              ],
            }));
          if (event.event === 'plan') {
            threadId.current = event.data.threadId;
            navigate(`/kit/t/${event.data.threadId}`);
            update((run) => ({
              ...run,
              version: event.data.version,
              plan: event.data.plan,
            }));
          }
          if (event.event === 'options') {
            const options = event.data.options;
            setLiveOptions({ token: runToken, options });
          }
          if (event.event === 'explanation')
            update((run) => ({
              ...run,
              explanation: run.explanation + event.data.delta,
            }));
          if (event.event === 'followup')
            update((run) => ({ ...run, followUp: event.data.followUp }));
          if (event.event === 'clarify')
            update((run) => ({ ...run, question: event.data.question }));
          if (event.event === 'error')
            update((run) => ({
              ...run,
              error: event.data.message,
              complete: true,
            }));
          if (event.event === 'done') {
            threadId.current = event.data.threadId;
            update((run) => ({
              ...run,
              complete: true,
              answered: event.data.answered,
              ...(event.data.answered
                ? {
                    steps: [
                      {
                        id: 'understand' as const,
                        status: 'done' as const,
                        detail: 'Answering',
                      },
                    ],
                  }
                : {}),
            }));
            // Do not await read-back: a later turn may already be streaming when it resolves.
            api
              .getThread(event.data.threadId)
              .then((saved) => applyThread(saved, runToken))
              .catch((e) => {
                if (active.current)
                  setError(`Kit saved, but reload failed: ${e.message}`);
              });
            refreshHistory();
          }
        }
      } catch (e) {
        if (!abort.signal.aborted)
          update((run) => ({
            ...run,
            complete: true,
            error:
              e instanceof Error
                ? e.message
                : 'Connection failed. Please retry.',
          }));
      } finally {
        inFlight.current = false;
        if (active.current) setBusy(false);
      }
    },
    [api, applyThread, navigate, refreshHistory],
  );
  const [liveOptions, setLiveOptions] = useState<{
    token: number;
    options: BasketOption[];
  }>();
  useEffect(() => {
    active.current = true;
    refreshHistory();
    if (id)
      api
        .getThread(id)
        .then((saved) => {
          if (!active.current || saved.thread.id !== threadId.current) return;
          applyThread(saved);
        })
        .catch((e) => {
          if (active.current) {
            setNotFound(e.message.includes('not found'));
            setError(e.message);
          }
        })
        .finally(() => {
          if (active.current) setLoading(false);
        });
    return () => {
      active.current = false;
      controller.current?.abort();
    };
  }, [api, id, applyThread, refreshHistory]);
  useEffect(() => {
    if (query && !started.current) {
      const timer = setTimeout(() => {
        started.current = true;
        void send(query);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [query, send]);
  const live = runs.at(-1);
  const streamedVersion: KitVersion | undefined = live?.plan
    ? {
        threadId: threadId.current || '',
        version: live.version || 1,
        createdAt: `${today}T00:00:00Z`,
        kind: thread ? 'refine' : 'new',
        userText: live.text,
        plan: live.plan,
        excludedKeys: [],
        status: live.question ? 'awaiting_budget' : 'ready',
        options: liveOptions?.token === live.token ? liveOptions.options : [],
        explanation: live.explanation,
        diff: null,
        selection: null,
        followUp: null,
      }
    : undefined;
  const savedVersions = thread?.versions || [];
  const versions = streamedVersion
    ? [
        ...savedVersions.filter((v) => v.version !== streamedVersion.version),
        streamedVersion,
      ]
    : savedVersions;
  const latest = versions.at(-1);
  const version = selectedVersion
    ? versions.find((v) => v.version === selectedVersion)
    : latest;
  async function adjust(change: Parameters<KitApi['adjust']>[1]) {
    if (!threadId.current || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api.adjust(threadId.current, change);
      setThread((old) =>
        old
          ? {
              ...old,
              thread: { ...old.thread, versionCount: result.version.version },
              versions: [
                ...old.versions.filter(
                  (v) => v.version !== result.version.version,
                ),
                result.version,
              ],
            }
          : {
              thread: {
                id: threadId.current!,
                title: result.version.userText.slice(0, 60),
                versionCount: result.version.version,
                updatedAt: result.version.createdAt,
                persona: 'lan',
              },
              versions: [result.version],
              messages: [],
            },
      );
      setRuns([]);
      setSelectionUndo(undefined);
      setSelectedVersion(result.version.version);
      refreshHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update kit');
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function priceSelection(selection: KitSelection, recordUndo = true) {
    if (!threadId.current || !latest || inFlight.current)
      throw new Error('Please wait for this kit to finish.');
    inFlight.current = true;
    setBusy(true);
    try {
      const { option } = await api.price(threadId.current, selection);
      if (recordUndo)
        setActions((old) => old.map((a) => ({ ...a, undo: undefined })));
      if (recordUndo)
        setSelectionUndo({
          version: latest.version,
          selection: selectionFor(latest, selection.profile),
        });
      else setSelectionUndo(undefined);
      setThread((old) =>
        old
          ? {
              ...old,
              versions: old.versions.map((v) =>
                v.version === latest.version
                  ? {
                      ...v,
                      selection,
                      options: v.options.map((o) =>
                        o.profile === selection.profile ? option : o,
                      ),
                    }
                  : v,
              ),
            }
          : old,
      );
      return option;
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function swap(profile: Profile, key: string, productId: string) {
    if (!latest) throw new Error('Please wait for this kit to finish.');
    return priceSelection(
      pickProduct(selectionFor(latest, profile), key, productId),
    );
  }
  async function undoPrice() {
    if (!selectionUndo || selectionUndo.version !== latest?.version)
      throw new Error('This edit is no longer available to undo.');
    return priceSelection(selectionUndo.selection, false);
  }
  async function chooseSuggestion(suggestion: FollowUp['suggestions'][number]) {
    if (!suggestion.action) {
      void send(suggestion.text);
      return;
    }
    if (!latest || inFlight.current) return;
    const action = suggestion.action;
    const actionId = ++token.current;
    const item = latest.plan.items.find((item) => item.key === action.itemKey);
    const candidate = latest.options
      .flatMap((o) => [
        ...o.lines.flatMap((l) => [{ product: l.product }, ...l.alternatives]),
        ...o.noMatch.flatMap((g) => (g.closest ? [g.closest.candidate] : [])),
        ...(o.interests || []).map((i) => i.candidate),
      ])
      .find((c) => c.product.id === action.productId);
    const previous = selectionFor(
      latest,
      visibleProfile,
    );
    setActions((old) => [
      ...old,
      {
        id: actionId,
        createdAt: new Date().toISOString(),
        userText: suggestion.text,
        text: 'Switching…',
      },
    ]);
    try {
      await swap(previous.profile, action.itemKey, action.productId);
      setActions((old) =>
        old.map((a) =>
          a.id === actionId
            ? {
                ...a,
                text: `Switched ${item?.needLabel || 'item'} to ${candidate?.product.title || 'selected product'}`,
                undo: () => {
                  void priceSelection(previous, false)
                    .then(() =>
                      setActions((items) =>
                        items.filter((i) => i.id !== actionId),
                      ),
                    )
                    .catch((e) => setError(e.message));
                },
              }
            : a,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not switch product');
      setActions((old) =>
        old.map((a) =>
          a.id === actionId ? { ...a, text: 'Could not switch product' } : a,
        ),
      );
    }
  }
  function add(option: BasketOption) {
    option.lines.forEach((line) =>
      cart.add({
        product: line.product,
        shop: line.shop,
        quantity: line.quantity,
      }),
    );
    window.location.assign('/cart');
  }
  return {
    persona,
    setPersona,
    setVisibleProfile,
    actions,
    messages: thread?.messages || [],
    chooseSuggestion,
    boundPersona: thread?.thread.persona || persona?.persona.id,
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
    canUndoPrice: !!selectionUndo && selectionUndo.version === latest?.version,
    add,
  };
}
