import { kitEventSchema } from '@/contract/schemas';
import type { KitEvent } from '@/contract/types';
/** POST SSE: retain incomplete UTF-8 codepoints and records across chunks. */
export async function* parseSSE(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<KitEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = '';
  let data: string[] = [];
  function line(text: string): KitEvent | undefined {
    if (!text) {
      if (!data.length) {
        event = '';
        return;
      }
      const result = kitEventSchema.parse({
        event,
        data: JSON.parse(data.join('\n')),
      });
      event = '';
      data = [];
      return result;
    }
    if (text.startsWith(':')) return;
    const colon = text.indexOf(':');
    const key = colon < 0 ? text : text.slice(0, colon);
    const value = colon < 0 ? '' : text.slice(colon + 1).replace(/^ /, '');
    if (key === 'event') event = value;
    if (key === 'data') data.push(value);
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const result = line(buffer.slice(0, end).replace(/\r$/, ''));
        buffer = buffer.slice(end + 1);
        if (result) yield result;
      }
      if (done) break;
    }
    if (buffer.trim()) line(buffer.replace(/\r$/, ''));
    const last = line('');
    if (last) yield last;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
