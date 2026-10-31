/** Bounded parallel pages. Each callback constructs a fresh query builder. */
export async function readPages<T>(
  name: string,
  fetchPage: (offset: number, size: number) => Promise<T[]>,
  size = 1000,
  parallel = 4,
): Promise<T[]> {
  if (
    !Number.isInteger(size) ||
    size < 1 ||
    !Number.isInteger(parallel) ||
    parallel < 1
  )
    throw new Error('Invalid paging bounds');
  const page = (offset: number) =>
    readWithRetry(`${name}: page ${offset}`, () => fetchPage(offset, size));
  const result: T[] = [];
  for (let offset = 0; ; offset += size * parallel) {
    const pages = await Promise.all(
      Array.from({ length: parallel }, (_, i) => page(offset + i * size)),
    );
    for (const values of pages) {
      result.push(...values);
      if (values.length < size) return result;
    }
  }
}

export async function readWithRetry<T>(
  name: string,
  read: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++)
    try {
      return await read();
    } catch (error) {
      if (attempt === 1)
        throw new Error(`${name} failed twice`, { cause: error });
    }
}
