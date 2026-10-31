import { z } from 'zod';

const money = z.number().int().nonnegative();
const count = z.number().int().nonnegative();
const date = z.string().date();
const timestamp = z.string().datetime();
export const eventTypeSchema = z.enum([
  'back_to_school',
  'newborn',
  'first_apartment',
  'camping_trip',
  'home_office',
  'tet_gifts',
  'other',
]);
export const shopTierSchema = z.enum(['mall', 'preferred', 'regular']);
export const categoryIdSchema = z.string().min(1);
export const personaIdSchema = z.enum(['lan', 'guest']);
export const profileSchema = z.enum(['saver', 'balanced', 'premium']);
export const shopSchema = z.object({
  id: z.string(),
  name: z.string(),
  tier: shopTierSchema,
  rating: z.number().min(0).max(5),
  shipFee: money,
  city: z.string(),
});
export const productSchema = z.object({
  id: z.string(),
  shopId: z.string(),
  title: z.string(),
  category: categoryIdSchema,
  description: z.string(),
  price: money,
  rating: z.number().min(0).max(5),
  reviewCount: count,
  soldCount: count,
  stock: count,
  tags: z.array(z.string()),
  attributes: z.record(z.string(), z.string()),
  shipDaysMin: count,
  shipDaysMax: count,
  updatedForDemandAt: timestamp.nullable(),
});
export const voucherSchema = z.object({
  id: z.string(),
  scope: z.enum(['platform', 'shop']),
  shopId: z.string().nullable(),
  code: z.string(),
  kind: z.enum(['fixed', 'percent', 'freeship']),
  value: money,
  maxDiscount: money.nullable(),
  minSpend: money,
  validUntil: date,
  ownerPersona: personaIdSchema.nullable(),
  label: z.string(),
});
export const personaSchema = z.object({
  id: personaIdSchema,
  name: z.string(),
  address: z.object({ district: z.string(), city: z.string() }).nullable(),
  favoriteShopIds: z.array(z.string()),
  cart: z.array(z.object({ productId: z.string(), addedAt: timestamp })),
});
export const planItemSchema = z.object({
  key: z.string(),
  needLabel: z.string(),
  category: categoryIdSchema.nullable(),
  required: z.boolean(),
  quantity: z.number().int().positive(),
  mustHaveTags: z.array(z.string()),
  niceToHaveTags: z.array(z.string()),
  maxUnitPrice: money.nullable(),
});
export const kitPlanSchema = z.object({
  event: eventTypeSchema,
  language: z.enum(['en', 'vi']),
  budget: money.nullable(),
  deadline: date.nullable(),
  items: z.array(planItemSchema),
  assumptions: z.array(z.string()),
});
export const candidateSchema = z.object({
  product: productSchema,
  shop: shopSchema,
  score: z.number().min(0).max(1),
  matchedTags: z.array(z.string()),
  arrivesBy: date,
});
export const closestSchema = z.object({
  candidate: candidateSchema,
  missingTags: z.array(z.string()),
  overMaxPriceBy: money.nullable(),
});
export const basketLineSchema = z.object({
  itemKey: z.string(),
  product: productSchema,
  shop: shopSchema,
  quantity: z.number().int().positive(),
  lineTotal: money,
  reason: z.string(),
  alternatives: z.array(candidateSchema).max(2),
});
export const shopGroupSchema = z.object({
  shopId: z.string(),
  shopName: z.string(),
  subtotal: money,
  shipping: money,
  shopDiscount: money,
  voucherCodes: z.array(z.string()),
});
export const savingSchema = z.object({
  label: z.string(),
  amount: money,
  wallet: z.boolean().optional(),
});
export const interestSchema = z.object({
  itemKey: z.string(),
  candidate: candidateSchema,
  addedToCartAt: timestamp,
  walletVoucherCode: z.string().nullable(),
  priceAfterVoucher: money,
  overMaxPriceBy: money.nullable(),
  missingTags: z.array(z.string()),
});
export const fitSuggestionSchema = z.object({
  id: z.string(),
  label: z.string(),
  removeItemKeys: z.array(z.string()),
  swaps: z.array(z.object({ itemKey: z.string(), productId: z.string() })),
  grandTotal: money,
  fits: z.boolean(),
  dropsMustHave: z.boolean(),
});
export const basketOptionSchema = z.object({
  profile: profileSchema,
  status: z.enum(['ok', 'over_budget']),
  lines: z.array(basketLineSchema),
  noMatch: z.array(
    z.object({
      itemKey: z.string(),
      needLabel: z.string(),
      reason: z.enum([
        'no_category',
        'no_product_with_tags',
        'none_in_time',
        'none_in_budget',
      ]),
      closest: closestSchema.nullable(),
    }),
  ),
  skipped: z.array(
    z.object({
      itemKey: z.string(),
      needLabel: z.string(),
      reason: z.literal('budget'),
    }),
  ),
  shops: z.array(shopGroupSchema),
  itemsTotal: money,
  shippingTotal: money,
  discountTotal: money,
  grandTotal: money,
  savings: z.array(savingSchema),
  minimumCost: money.optional(),
  costDrivers: z.array(z.string()).optional(),
  overBy: money.optional(),
  fit: z.array(fitSuggestionSchema).max(2).optional(),
  interests: z.array(interestSchema).optional(),
});
export const planDiffSchema = z.object({
  added: z.array(z.string()),
  removed: z.array(z.string()),
  changed: z.array(z.string()),
});
export const salesContextSchema = z.object({
  today: date,
  deadline: date.nullable(),
  daysLeft: z.number().int().nullable(),
  address: z.string().nullable(),
  interests: z.array(
    z.object({
      itemKey: z.string(),
      title: z.string(),
      price: money,
      priceAfterVoucher: money,
      voucherCode: z.string().nullable(),
      overMaxPriceBy: money.nullable(),
    }),
  ),
  walletVouchers: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      validUntil: date,
      daysToExpiry: z.number().int(),
      usedInBasket: z.boolean(),
    }),
  ),
  freeshipGaps: z.array(z.object({ shopName: z.string(), missing: money })),
  favoriteShopPromos: z.array(
    z.object({ shopName: z.string(), code: z.string(), label: z.string() }),
  ),
  hooks: z.array(
    z.enum([
      'deadline_soon',
      'cart_interest',
      'voucher_expiring',
      'freeship_gap',
      'favorite_shop_promo',
    ]),
  ),
});
export const followUpSchema = z.object({
  question: z.string().endsWith('?'),
  suggestions: z
    .array(
      z.object({
        text: z.string().max(40),
        action: z
          .object({
            type: z.literal('swap'),
            itemKey: z.string(),
            productId: z.string(),
          })
          .optional(),
      }),
    )
    .min(2)
    .max(3),
  source: z.enum(['llm', 'template']),
});
export const kitSelectionSchema = z.object({
  profile: profileSchema,
  picks: z.record(z.string(), z.string()),
  dropped: z.array(z.string()),
});
export const kitVersionSchema = z.object({
  threadId: z.string(),
  version: z.number().int().positive(),
  createdAt: timestamp,
  kind: z.enum(['new', 'refine', 'adjust', 'restore']),
  userText: z.string(),
  plan: kitPlanSchema,
  excludedKeys: z.array(z.string()),
  status: z.enum(['awaiting_budget', 'ready']),
  options: z.array(basketOptionSchema),
  explanation: z.string(),
  diff: planDiffSchema.nullable(),
  selection: kitSelectionSchema.nullable(),
  followUp: followUpSchema.nullable(),
});
export const kitMessageSchema = z.object({
  threadId: z.string(),
  afterVersion: z.number().int().positive(),
  createdAt: timestamp,
  userText: z.string(),
  answer: z.string(),
  followUp: followUpSchema.nullable(),
});
export const kitThreadSummarySchema = z.object({
  id: z.string(),
  title: z.string().max(60),
  updatedAt: timestamp,
  versionCount: count,
  persona: personaIdSchema,
});
export const demandItemRowSchema = z.object({
  sessionId: z.string(),
  createdAt: timestamp,
  event: eventTypeSchema,
  needLabel: z.string(),
  category: categoryIdSchema.nullable(),
  tags: z.array(z.string()),
  matchedCount: count,
  budgetHint: money.nullable(),
});
export const recentDemandItemSchema = demandItemRowSchema.extend({
  source: z.enum(['live', 'seed']),
});
export const errorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export const categorySchema = z.object({
  id: categoryIdSchema,
  label: z.string(),
  event: eventTypeSchema,
  icon: z.string(),
  color: z.string(),
});
export const productsResponseSchema = z.object({
  products: z.array(productSchema.extend({ shop: shopSchema })),
});
export const productResponseSchema = z.object({
  product: productSchema,
  shop: shopSchema,
  vouchers: z.array(voucherSchema),
});
export const shopsResponseSchema = z.object({ shops: z.array(shopSchema) });
export const categoriesResponseSchema = z.object({
  categories: z.array(categorySchema),
});
export const checkoutRequestSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive().max(999),
      }),
    )
    .min(1)
    .max(100),
});
export const checkoutResponseSchema = z.object({
  orderId: z.string(),
  grandTotal: money,
});
export const personaRequestSchema = z.object({ id: personaIdSchema });
export const personaResponseSchema = z.object({
  persona: personaSchema,
  walletVouchers: z.array(voucherSchema),
});
export const kitRequestSchema = z.object({
  query: z.string().min(1),
  profiles: z.array(profileSchema).optional(),
});
export const refineRequestSchema = z.object({
  threadId: z.string(),
  message: z.string(),
  profiles: z.array(profileSchema).optional(),
});
export const adjustChangeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set_budget'), budget: money.nullable() }),
  z.object({ type: z.literal('set_deadline'), deadline: date.nullable() }),
  z.object({ type: z.literal('remove_item'), itemKey: z.string() }),
  z.object({ type: z.literal('restore_item'), itemKey: z.string() }),
  z.object({
    type: z.literal('restore_version'),
    version: z.number().int().positive(),
  }),
]);
export const adjustRequestSchema = z.object({
  threadId: z.string(),
  change: adjustChangeSchema,
});
export const adjustResponseSchema = z.object({ version: kitVersionSchema });
export const priceRequestSchema = z.object({
  threadId: z.string(),
  selection: kitSelectionSchema,
});
export const priceResponseSchema = z.object({ option: basketOptionSchema });
export const threadsResponseSchema = z.object({
  threads: z.array(kitThreadSummarySchema),
});
export const threadResponseSchema = z.object({
  thread: kitThreadSummarySchema,
  versions: z.array(kitVersionSchema),
  messages: z.array(kitMessageSchema),
});
export const stepPayloadSchema = z.object({
  id: z.enum(['understand', 'plan', 'search', 'optimize', 'explain']),
  status: z.enum(['running', 'done']),
  detail: z.string().optional(),
});
export const planPayloadSchema = z.object({
  sessionId: z.string(),
  threadId: z.string(),
  version: z.number().int().positive(),
  plan: kitPlanSchema,
  diff: planDiffSchema.optional(),
});
export const clarifyPayloadSchema = z.object({
  threadId: z.string(),
  version: z.number().int().positive(),
  question: z.object({
    kind: z.literal('budget'),
    text: z.string(),
    choices: z.array(money.nullable()),
  }),
});
export const optionsPayloadSchema = z.object({
  options: z.array(basketOptionSchema),
});
export const explanationPayloadSchema = z.object({ delta: z.string() });
export const followupPayloadSchema = z.object({ followUp: followUpSchema });
export const donePayloadSchema = z.object({
  sessionId: z.string().nullable(),
  threadId: z.string(),
  version: z.number().int().positive(),
  answered: z.literal(true).optional(),
});
export const errorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export const kitEventSchema = z.discriminatedUnion('event', [
  z.object({ event: z.literal('step'), data: stepPayloadSchema }),
  z.object({ event: z.literal('plan'), data: planPayloadSchema }),
  z.object({ event: z.literal('clarify'), data: clarifyPayloadSchema }),
  z.object({ event: z.literal('options'), data: optionsPayloadSchema }),
  z.object({ event: z.literal('explanation'), data: explanationPayloadSchema }),
  z.object({ event: z.literal('followup'), data: followupPayloadSchema }),
  z.object({ event: z.literal('done'), data: donePayloadSchema }),
  z.object({ event: z.literal('error'), data: errorPayloadSchema }),
]);
const candidateEvidenceSchema = z.object({
  productId: z.string(),
  title: z.string(),
  evidence: z.string(),
});
export const gapSchema = z.object({
  key: z.string(),
  type: z.enum(['listing_gap', 'assortment_gap']),
  needLabel: z.string(),
  category: categoryIdSchema.nullable(),
  tags: z.array(z.string()),
  thisWeek: count,
  lastWeek: count,
  matchingProducts: count,
  priceBand: z.object({ p25: money, p75: money }).nullable(),
  neededWith: z.array(
    z.object({ category: categoryIdSchema, share: z.number().min(0).max(1) }),
  ),
  advice: z.string(),
  candidates: z.array(candidateEvidenceSchema).optional(),
  appliedFix: z
    .object({ productId: z.string(), title: z.string(), appliedAt: timestamp })
    .nullable(),
  watchers: count.optional(),
});
export const insightsResponseSchema = z.object({
  window: z.object({
    thisWeekFrom: z.string(),
    lastWeekFrom: z.string(),
    today: date,
  }),
  gaps: z.array(gapSchema),
  combos: z.array(z.object({ categories: z.array(categoryIdSchema), count })),
  topNeeds: z.array(z.object({ event: eventTypeSchema, count })),
  recent: z.array(
    z.object({
      needLabel: z.string(),
      category: categoryIdSchema.nullable(),
      tags: z.array(z.string()),
      event: eventTypeSchema,
      createdAt: timestamp,
    }),
  ),
});
export const enrichmentPreviewRequestSchema = z.object({
  productId: z.string(),
  gapKey: z.string(),
});
export const enrichmentPreviewResponseSchema = z.object({
  proposalId: z.string(),
  before: productSchema,
  after: productSchema,
  added: z.object({
    titleSuffix: z.string(),
    tags: z.array(z.string()),
    attributes: z.record(z.string(), z.string()),
    descriptionAppend: z.string(),
  }),
  kept: z.object({ title: z.string(), tags: z.array(z.string()) }),
  keywordCheck: z.array(
    z.object({ keyword: z.string(), stillMatches: z.boolean() }),
  ),
  evidence: z.string(),
});
export const enrichmentApplyRequestSchema = z.object({
  proposalId: z.string(),
});
export const enrichmentUndoRequestSchema = z.object({ productId: z.string() });
export const enrichmentResponseSchema = z.object({ product: productSchema });
export const demandWatchRequestSchema = z.object({ gapKey: z.string() });
export const demandWatchResponseSchema = z.object({ watchers: count });
