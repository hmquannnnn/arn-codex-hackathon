import { z } from 'zod';
import { OpenAILLM } from './client';
import type { Effort, LLMOptions, Message } from './types';
export { OpenAILLM } from './client';
export { FakeLLM } from './fake';
export type * from './types';
let client: OpenAILLM | undefined;
export function getLLM() {
  return (client ??= new OpenAILLM());
}
export function structured<T>(
  model: string,
  schema: z.ZodType<T>,
  messages: Message[],
  options?: LLMOptions,
) {
  return getLLM().structured(model, schema, messages, options);
}
export function stream(
  model: string,
  messages: Message[],
  options?: LLMOptions,
) {
  return getLLM().stream(model, messages, options);
}
export function getModels(): {
  planner: string;
  fast: string;
  plannerEffort: Effort;
  fastEffort: Effort;
} {
  const effort = z.enum(['minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
  return {
    planner: process.env.KITLY_MODEL_PLANNER || 'gpt-6-luna',
    fast: process.env.KITLY_MODEL_FAST || 'gpt-6-luna',
    plannerEffort: effort.parse(process.env.KITLY_PLANNER_EFFORT || 'low'),
    fastEffort: effort.parse(process.env.KITLY_FAST_EFFORT || 'low'),
  };
}
