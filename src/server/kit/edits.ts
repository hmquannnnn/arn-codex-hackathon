import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  adjustRequestSchema,
  priceRequestSchema,
  profileSchema,
} from '@/contract/schemas';
import type { CommerceAdapter } from '@/contract/commerce-adapter';
import type { KitStore } from '@/contract/kit-store';
import { ownerFrom } from '@/server/identity';
import { HttpError, jsonEndpoint } from '@/server/http';
import { loadRefineThread } from '@/server/refine';
import { matchPlan } from '@/server/matcher';
import { optimizeProfiles } from '@/server/optimizer';
import { priceSelection } from '@/server/optimizer/selection';
import { diffPlans } from '@/server/diff';

type Deps = { adapter: CommerceAdapter; store: KitStore };
export function createEditHandlers(dependencies: Deps | (() => Deps)) {
  const deps = () =>
    typeof dependencies === 'function' ? dependencies() : dependencies;
  return {
    adjust: (request: Request) =>
      jsonEndpoint(async () => {
        const start = performance.now();
        const body = adjustRequestSchema
          .extend({ profiles: z.array(profileSchema).min(1).optional() })
          .parse(await request.json());
        const owner = ownerFrom(request),
          { adapter, store } = deps();
        // Persona is thread-owned: fetch both possible voucher sets while loading history.
        const shops = adapter.listShops();
        const products = adapter.searchProducts({});
        const [thread, lanVouchers, guestVouchers] = await Promise.all([
          loadRefineThread(body.threadId, owner, store),
          adapter.listVouchers('lan'),
          adapter.listVouchers('guest'),
        ]);
        const latest = thread.versions.at(-1)!;
        let plan = structuredClone(latest.plan),
          excludedKeys = [...latest.excludedKeys];
        const change = body.change;
        let label: string = {
          set_budget:
            plan.language === 'vi' ? 'Đã đổi ngân sách' : 'Updated budget',
          set_deadline:
            plan.language === 'vi' ? 'Đã đổi hạn nhận' : 'Updated deadline',
          restore_version:
            plan.language === 'vi'
              ? 'Đã khôi phục phiên bản'
              : 'Restored version',
          remove_item: '',
          restore_item: '',
        }[change.type];
        if (change.type === 'restore_version') {
          const historical = thread.versions.find(
            (v) => v.version === change.version,
          );
          if (!historical)
            throw new HttpError(400, 'invalid_request', 'Unknown version');
          plan = structuredClone(historical.plan);
          excludedKeys = [...historical.excludedKeys];
        } else if (change.type === 'set_budget') plan.budget = change.budget;
        else if (change.type === 'set_deadline')
          plan.deadline = change.deadline;
        else {
          const historical = [...thread.versions]
            .reverse()
            .find((v) => v.plan.items.some((i) => i.key === change.itemKey));
          const item = historical?.plan.items.find(
            (i) => i.key === change.itemKey,
          );
          if (!item)
            throw new HttpError(400, 'invalid_request', 'Unknown item');
          label = `${plan.language === 'vi' ? (change.type === 'remove_item' ? 'Đã bỏ' : 'Đã khôi phục') : change.type === 'remove_item' ? 'Removed' : 'Restored'}: ${item.needLabel}`;
          if (change.type === 'remove_item') {
            plan.items = plan.items.filter((i) => i.key !== item.key);
            excludedKeys = [...new Set([...excludedKeys, item.key])];
          } else {
            excludedKeys = excludedKeys.filter((key) => key !== item.key);
            if (!plan.items.some((i) => i.key === item.key)) {
              const index = historical!.plan.items.findIndex(
                (i) => i.key === item.key,
              );
              plan.items.splice(Math.min(index, plan.items.length), 0, item);
            }
          }
        }
        const matched = await matchPlan(plan, adapter, shops, products);
        const vouchers =
          thread.thread.persona === 'lan' ? lanVouchers : guestVouchers;
        const awaiting =
          latest.status === 'awaiting_budget' && change.type !== 'set_budget';
        const options = awaiting
          ? []
          : optimizeProfiles(
              {
                plan,
                candidates: matched.candidates,
                noMatch: matched.noMatch,
                vouchers,
              },
              body.profiles,
            );
        if (!awaiting && !thread.versions.some((v) => v.status === 'ready')) {
          const { sessionId } = await adapter.recordIntent({
            query: thread.thread.title,
            plan,
            source: 'live',
          });
          await adapter.recordDemandItems(
            sessionId,
            plan.items.map((item) => ({
              item,
              matchedCount: matched.matchedCounts[item.key] ?? 0,
              budgetHint:
                item.maxUnitPrice ??
                (plan.budget === null
                  ? null
                  : Math.floor(plan.budget / Math.max(1, plan.items.length))),
            })),
          );
        }
        const total =
          (options.find((o) => o.profile === 'balanced') ?? options[0])
            ?.grandTotal ?? 0;
        const explanation = `${label}. ${plan.language === 'vi' ? 'Tổng mới' : 'New total'} ${new Intl.NumberFormat('vi-VN').format(total)}₫.`;
        const version = await store.appendVersion(
          {
            threadId: body.threadId,
            kind: change.type === 'restore_version' ? 'restore' : 'adjust',
            userText: label,
            plan,
            excludedKeys,
            status: awaiting ? 'awaiting_budget' : 'ready',
            options,
            explanation,
            diff: diffPlans(latest.plan, plan),
            selection: null,
            followUp: null,
          },
          owner,
        );
        console.info(
          `[kit] adjust ${((performance.now() - start) / 1000).toFixed(3)}s`,
        );
        return NextResponse.json({ version });
      }),
    price: (request: Request) =>
      jsonEndpoint(async () => {
        const start = performance.now();
        const { threadId, selection } = priceRequestSchema.parse(
          await request.json(),
        );
        const owner = ownerFrom(request),
          { adapter, store } = deps();
        const shops = adapter.listShops();
        const products = adapter.searchProducts({});
        const [thread, lanVouchers, guestVouchers] = await Promise.all([
          loadRefineThread(threadId, owner, store),
          adapter.listVouchers('lan'),
          adapter.listVouchers('guest'),
        ]);
        const latest = thread.versions.at(-1)!;
        if (latest.status !== 'ready')
          throw new HttpError(
            400,
            'invalid_request',
            'Budget is required first',
          );
        const matched = await matchPlan(latest.plan, adapter, shops, products);
        const option = priceSelection(
          latest.plan,
          matched,
          selection,
          thread.thread.persona === 'lan' ? lanVouchers : guestVouchers,
        );
        await store.saveSelection(threadId, owner, selection);
        console.info(
          `[kit] price ${((performance.now() - start) / 1000).toFixed(3)}s`,
        );
        return NextResponse.json({ option });
      }),
    threads: (request: Request) =>
      jsonEndpoint(async () =>
        NextResponse.json({
          threads: await deps().store.listThreads(ownerFrom(request)),
        }),
      ),
    thread: (request: Request, id: string) =>
      jsonEndpoint(async () =>
        NextResponse.json(
          await loadRefineThread(id, ownerFrom(request), deps().store),
        ),
      ),
  };
}
