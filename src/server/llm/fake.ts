import type { z } from 'zod';
import type { Effort, LLM, LLMOptions, Message } from './types';
export class FakeLLM implements LLM {
  readonly calls: {
    kind: 'structured' | 'stream';
    model: string;
    messages: Message[];
    effort?: Effort;
  }[] = [];
  private outputs: unknown[];
  constructor(
    outputs: unknown[] = [],
    private chunks: string[] = [],
  ) {
    this.outputs = structuredClone(outputs);
  }
  async structured<T>(
    model: string,
    schema: z.ZodType<T>,
    messages: Message[],
    options: LLMOptions = {},
  ): Promise<T> {
    this.calls.push({
      kind: 'structured',
      model,
      messages: structuredClone(messages),
      effort: options.effort,
    });
    if (!this.outputs.length) throw new Error('FakeLLM has no scripted output');
    return schema.parse(this.outputs.shift());
  }
  async *stream(
    model: string,
    messages: Message[],
    options: LLMOptions = {},
  ): AsyncGenerator<string> {
    this.calls.push({
      kind: 'stream',
      model,
      messages: structuredClone(messages),
      effort: options.effort,
    });
    for (const delta of this.chunks) yield delta;
  }
}
