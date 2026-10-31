/** Guard text deltas. Cancellation must abort blocking upstream I/O when a stream stalls. */
export async function* withIdleTimeout<T>(
  source: AsyncIterable<T>,
  timeoutMs = 20_000,
  cancel?: (reason?: Error) => void,
): AsyncGenerator<T> {
  const iterator = source[Symbol.asyncIterator]();
  let finished = false;
  let cancelled = false;
  function cancelUpstream(reason?: Error) {
    if (cancelled) return;
    cancelled = true;
    cancel?.(reason);
  }
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const next = await Promise.race([
          iterator.next(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              const error = new Error(
                `LLM stream idle: no text delta for ${timeoutMs} ms`,
              );
              cancelUpstream(error);
              reject(error);
            }, timeoutMs);
          }),
        ]);
        if (next.done) {
          finished = true;
          return;
        }
        yield next.value;
      } finally {
        clearTimeout(timer);
      }
    }
  } finally {
    if (!finished) {
      cancelUpstream();
      // A generic iterator may ignore cancellation: never await its blocked return.
      void iterator.return?.().catch(() => {});
    }
  }
}
