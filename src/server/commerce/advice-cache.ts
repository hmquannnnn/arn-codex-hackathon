/** Kitly-owned derived cache; separate from the frozen marketplace contract. */
export interface InsightAdviceCache {
  getInsightAdvice(key: string, signature: string): Promise<string | null>;
  saveInsightAdvice(
    key: string,
    signature: string,
    advice: string,
  ): Promise<void>;
}
