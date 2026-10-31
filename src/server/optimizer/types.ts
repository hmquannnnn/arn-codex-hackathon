import type { BasketOption, Candidate, KitPlan, Voucher } from '@/contract/types';
/** Exact matcher pools and applicable public/wallet vouchers for one plan. */
export interface OptimizerInput {
  plan: KitPlan;
  candidates: Record<string, Candidate[]>;
  vouchers: Voucher[];
  noMatch?: BasketOption['noMatch'];
}
