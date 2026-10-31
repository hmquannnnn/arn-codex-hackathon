'use client';
import { Check, LoaderCircle } from 'lucide-react';
import type {
  ClarifyPayload,
  KitPlan,
  KitVersion,
  StepPayload,
} from '@/contract/types';
import { money } from '@/lib/client/store';
import { InlineEdit } from './inline-edit';
export type LiveTurn = {
  token: number;
  text: string;
  version?: number;
  plan?: KitPlan;
  steps: StepPayload[];
  explanation: string;
  question?: ClarifyPayload['question'];
  error?: string;
  complete?: boolean;
};
export function BudgetChoices({
  question,
  onBudget,
  disabled = false,
}: {
  question?: ClarifyPayload['question'];
  onBudget?: (budget: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-4">
      <p className="font-medium">{question?.text || "What's your budget?"}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(question?.choices || [500000, 1000000, 2000000, null]).map(
          (choice) => (
            <button
              key={String(choice)}
              disabled={disabled}
              onClick={() => onBudget?.(choice)}
              className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800 disabled:opacity-50"
            >
              {choice === null ? 'No limit' : money(choice)}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
const labels = {
  understand: 'Understanding',
  plan: 'Planning',
  search: 'Comparing products',
  optimize: 'Optimizing',
  explain: 'Explaining',
};
export function Conversation({
  versions,
  live = [],
  onBudget,
  onRetry,
  onRefine,
  onUndoRemove,
  disabled = false,
}: {
  versions: KitVersion[];
  live?: LiveTurn[];
  onBudget?: (budget: number | null) => void;
  onRetry?: (text: string) => void;
  onRefine?: (text: string) => void;
  onUndoRemove?: (key: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-7" aria-live="polite">
      {versions.map((v) =>
        v.kind === 'adjust' || v.kind === 'restore' ? (
          <p
            key={v.version}
            className="rounded-lg bg-slate-100 p-3 text-xs text-slate-600"
          >
            ⚙ {systemText(v, versions)}
            {v.excludedKeys
              .filter(
                (key) =>
                  !versions
                    .find((previous) => previous.version === v.version - 1)
                    ?.excludedKeys.includes(key) &&
                  versions.at(-1)?.excludedKeys.includes(key),
              )
              .map((key) => {
                const label =
                  versions
                    .flatMap((previous) => previous.plan.items)
                    .find((item) => item.key === key)?.needLabel || key;
                return (
                  onUndoRemove && (
                    <button
                      key={key}
                      aria-label={`Undo removal of ${label}`}
                      disabled={disabled}
                      onClick={() => onUndoRemove(key)}
                      className="ml-2 text-accent underline"
                    >
                      Undo
                    </button>
                  )
                );
              })}
          </p>
        ) : (
          <div key={v.version} className="space-y-4">
            <UserBubble text={v.userText} />
            <div className="max-w-xl">
              <p className="mb-2 text-xs font-bold text-accent">KITLY</p>
              <p className="text-xs text-slate-500">
                ✓ Planned {v.plan.items.length} items · compared products ·
                Version {v.version}
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
                {v.explanation}
              </p>
              <Assumptions
                plan={v.plan}
                onRefine={onRefine}
                disabled={disabled}
              />
              {v.status === 'awaiting_budget' && (
                <BudgetChoices onBudget={onBudget} disabled={disabled} />
              )}
            </div>
          </div>
        ),
      )}
      {live.map((turn) => (
        <div key={turn.token} className="space-y-4">
          <UserBubble text={turn.text} />
          <div>
            <p className="mb-3 text-xs font-bold text-accent">KITLY</p>
            {turn.complete ? (
              <p className="text-xs text-slate-500">
                ✓{' '}
                {turn.steps
                  .filter((s) => s.detail)
                  .map((s) => s.detail)
                  .join(' · ') ||
                  `Planned ${turn.plan?.items.length || 0} items`}
              </p>
            ) : (
              <ol className="space-y-2 text-xs text-slate-500">
                {turn.steps.map((step) => (
                  <li key={step.id} className="flex items-center gap-2">
                    {step.status === 'done' ? (
                      <Check size={14} className="text-emerald-600" />
                    ) : (
                      <LoaderCircle size={14} className="animate-spin" />
                    )}
                    {step.detail || labels[step.id]}
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
              {turn.explanation}
            </p>
            {turn.plan && (
              <Assumptions
                plan={turn.plan}
                onRefine={onRefine}
                disabled={disabled}
              />
            )}
            {turn.question && (
              <BudgetChoices
                question={turn.question}
                onBudget={onBudget}
                disabled={disabled}
              />
            )}
            {turn.error && (
              <div
                role="alert"
                className="mt-3 rounded-xl bg-red-50 p-4 text-sm text-red-800"
              >
                {turn.error}
                <button
                  disabled={disabled}
                  onClick={() => onRetry?.(turn.text)}
                  className="ml-3 underline"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
function UserBubble({ text }: { text: string }) {
  return (
    <p
      data-testid="user-turn"
      className="ml-auto max-w-[90%] rounded-2xl rounded-br-sm bg-orange-50 px-4 py-3 text-sm leading-6"
    >
      {text}
    </p>
  );
}
function Assumptions({
  plan,
  onRefine,
  disabled,
}: {
  plan: KitPlan;
  onRefine?: (text: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {plan.assumptions.map((a, i) => (
        <span
          key={i}
          className="rounded-full border px-3 py-1 text-xs text-slate-500"
        >
          {onRefine ? (
            <InlineEdit
              label={`assumption: ${a}`}
              value={a}
              display={a}
              disabled={disabled}
              onSave={(value) => onRefine(`"${a}" is wrong: ${value}`)}
            />
          ) : (
            a
          )}
        </span>
      ))}
    </div>
  );
}

function systemText(version: KitVersion, versions: KitVersion[]) {
  const previous = versions.find((v) => v.version === version.version - 1);
  const removed = version.excludedKeys.filter(
    (key) => !previous?.excludedKeys.includes(key),
  );
  if (removed.length)
    return `Removed: ${removed.map((key) => previous?.plan.items.find((item) => item.key === key)?.needLabel || key).join(', ')}`;
  return version.explanation || version.userText;
}
