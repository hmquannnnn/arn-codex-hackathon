import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { ServiceTier } from 'openai/resources/responses/responses';
import { z } from 'zod';
import type { LLM, LLMOptions, Message } from './types';
import { withIdleTimeout } from './idle';
export class OpenAILLM implements LLM {
  private client: OpenAI;
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      ...(process.env.OPENAI_BASE_URL
        ? { baseURL: process.env.OPENAI_BASE_URL }
        : {}),
      timeout: 45_000,
      maxRetries: 1,
    });
  }
  private settings(options: LLMOptions) {
    const tier = process.env.KITLY_SERVICE_TIER ?? 'fast';
    const serviceTier = tier
      ? (z
          .enum(['auto', 'default', 'fast', 'flex', 'priority', 'ultrafast'])
          .parse(tier) satisfies ServiceTier)
      : undefined;
    return {
      ...(options.effort ? { reasoning: { effort: options.effort } } : {}),
      ...(serviceTier ? { service_tier: serviceTier } : {}),
    };
  }
  async structured<T>(
    model: string,
    schema: z.ZodType<T>,
    messages: Message[],
    options: LLMOptions = {},
  ): Promise<T> {
    const response = await this.client.responses.create({
      model,
      input: messages,
      text: { format: zodTextFormat(schema, 'result') },
      ...this.settings(options),
    });
    if (!response.output_text) throw new Error('No structured output returned');
    return schema.parse(JSON.parse(response.output_text));
  }
  async *stream(
    model: string,
    messages: Message[],
    options: LLMOptions = {},
  ): AsyncGenerator<string> {
    const controller = new AbortController();
    const client = this.client;
    const request = {
      model,
      input: messages,
      stream: true as const,
      ...this.settings(options),
    };
    async function* textDeltas() {
      const events = await client.responses.create(request, {
        signal: controller.signal,
      });
      for await (const event of events) {
        if (event.type === 'response.output_text.delta' && event.delta.length)
          yield event.delta;
        else if (
          event.type === 'error' ||
          event.type === 'response.failed' ||
          event.type === 'response.incomplete'
        ) {
          throw new Error('LLM stream failed');
        }
      }
    }
    try {
      yield* withIdleTimeout(textDeltas(), 20_000, (reason) =>
        controller.abort(reason),
      );
      if (controller.signal.aborted) throw controller.signal.reason;
    } finally {
      controller.abort();
    }
  }
}
