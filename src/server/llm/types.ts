import type { z } from 'zod';
export type Effort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export interface LLMOptions {
  effort?: Effort;
}
export interface Message {
  role: 'system' | 'developer' | 'user' | 'assistant';
  content: string;
}
export interface LLM {
  structured<T>(
    model: string,
    schema: z.ZodType<T>,
    messages: Message[],
    options?: LLMOptions,
  ): Promise<T>;
  stream(
    model: string,
    messages: Message[],
    options?: LLMOptions,
  ): AsyncGenerator<string>;
}
