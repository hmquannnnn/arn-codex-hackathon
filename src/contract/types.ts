import type { z } from 'zod';
import type * as s from './schemas';
export type EventType = z.infer<typeof s.eventTypeSchema>;
export type ShopTier = z.infer<typeof s.shopTierSchema>;
export type CategoryId = z.infer<typeof s.categoryIdSchema>;
export type PersonaId = z.infer<typeof s.personaIdSchema>;
export type Profile = z.infer<typeof s.profileSchema>;
export type Shop = z.infer<typeof s.shopSchema>;
export type Product = z.infer<typeof s.productSchema>;
export type Voucher = z.infer<typeof s.voucherSchema>;
export type Persona = z.infer<typeof s.personaSchema>;
export type PlanItem = z.infer<typeof s.planItemSchema>;
export type KitPlan = z.infer<typeof s.kitPlanSchema>;
export type Candidate = z.infer<typeof s.candidateSchema>;
export type Closest = z.infer<typeof s.closestSchema>;
export type BasketLine = z.infer<typeof s.basketLineSchema>;
export type ShopGroup = z.infer<typeof s.shopGroupSchema>;
export type Saving = z.infer<typeof s.savingSchema>;
export type Interest = z.infer<typeof s.interestSchema>;
export type FitSuggestion = z.infer<typeof s.fitSuggestionSchema>;
export type BasketOption = z.infer<typeof s.basketOptionSchema>;
export type PlanDiff = z.infer<typeof s.planDiffSchema>;
export type SalesContext = z.infer<typeof s.salesContextSchema>;
export type FollowUp = z.infer<typeof s.followUpSchema>;
export type KitSelection = z.infer<typeof s.kitSelectionSchema>;
export type KitVersion = z.infer<typeof s.kitVersionSchema>;
export type KitMessage = z.infer<typeof s.kitMessageSchema>;
export type KitThreadSummary = z.infer<typeof s.kitThreadSummarySchema>;
export type DemandItemRow = z.infer<typeof s.demandItemRowSchema>;
export type RecentDemandItem = z.infer<typeof s.recentDemandItemSchema>;
export type ErrorResponse = z.infer<typeof s.errorResponseSchema>;
export type Category = z.infer<typeof s.categorySchema>;
export type ProductsResponse = z.infer<typeof s.productsResponseSchema>;
export type ProductResponse = z.infer<typeof s.productResponseSchema>;
export type ShopsResponse = z.infer<typeof s.shopsResponseSchema>;
export type CategoriesResponse = z.infer<typeof s.categoriesResponseSchema>;
export type CheckoutRequest = z.infer<typeof s.checkoutRequestSchema>;
export type CheckoutResponse = z.infer<typeof s.checkoutResponseSchema>;
export type PersonaRequest = z.infer<typeof s.personaRequestSchema>;
export type PersonaResponse = z.infer<typeof s.personaResponseSchema>;
export type KitRequest = z.infer<typeof s.kitRequestSchema>;
export type RefineRequest = z.infer<typeof s.refineRequestSchema>;
export type AdjustChange = z.infer<typeof s.adjustChangeSchema>;
export type AdjustRequest = z.infer<typeof s.adjustRequestSchema>;
export type AdjustResponse = z.infer<typeof s.adjustResponseSchema>;
export type PriceRequest = z.infer<typeof s.priceRequestSchema>;
export type PriceResponse = z.infer<typeof s.priceResponseSchema>;
export type ThreadsResponse = z.infer<typeof s.threadsResponseSchema>;
export type ThreadResponse = z.infer<typeof s.threadResponseSchema>;
export type StepPayload = z.infer<typeof s.stepPayloadSchema>;
export type PlanPayload = z.infer<typeof s.planPayloadSchema>;
export type ClarifyPayload = z.infer<typeof s.clarifyPayloadSchema>;
export type OptionsPayload = z.infer<typeof s.optionsPayloadSchema>;
export type ExplanationPayload = z.infer<typeof s.explanationPayloadSchema>;
export type FollowupPayload = z.infer<typeof s.followupPayloadSchema>;
export type DonePayload = z.infer<typeof s.donePayloadSchema>;
export type ErrorPayload = z.infer<typeof s.errorPayloadSchema>;
export type KitEvent = z.infer<typeof s.kitEventSchema>;
export type Gap = z.infer<typeof s.gapSchema>;
export type InsightsResponse = z.infer<typeof s.insightsResponseSchema>;
export type EnrichmentPreviewRequest = z.infer<
  typeof s.enrichmentPreviewRequestSchema
>;
export type EnrichmentPreviewResponse = z.infer<
  typeof s.enrichmentPreviewResponseSchema
>;
export type EnrichmentApplyRequest = z.infer<
  typeof s.enrichmentApplyRequestSchema
>;
export type EnrichmentUndoRequest = z.infer<
  typeof s.enrichmentUndoRequestSchema
>;
export type EnrichmentResponse = z.infer<typeof s.enrichmentResponseSchema>;
export type DemandWatchRequest = z.infer<typeof s.demandWatchRequestSchema>;
export type DemandWatchResponse = z.infer<typeof s.demandWatchResponseSchema>;
