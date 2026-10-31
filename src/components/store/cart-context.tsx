'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { z } from 'zod';
import { productSchema, shopSchema } from '@/contract/schemas';
import { mergeKit, subtractPurchased } from '@/lib/client/cart-flow';
import type { CartLine } from '@/lib/client/store';
const storedSchema = z.array(
  z.object({
    product: productSchema,
    shop: shopSchema,
    quantity: z.number().int().positive(),
  }),
);
const Context = createContext<{
  lines: CartLine[];
  ready: boolean;
  merge: (lines: CartLine[]) => void;
  purchased: (lines: { productId: string; quantity: number }[]) => void;
  add: (line: CartLine) => void;
  quantity: (id: string, count: number) => void;
  clear: () => void;
} | null>(null);
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const parsed = storedSchema.safeParse(
        JSON.parse(localStorage.getItem('kitly-cart') || '[]'),
      );
      if (parsed.success) setLines(parsed.data);
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem('kitly-cart', JSON.stringify(lines));
      } catch {}
    }
  }, [lines, ready]);
  return (
    <Context.Provider
      value={{
        lines,
        ready,
        merge: (kit) => {
          const next = mergeKit(lines, kit);
          localStorage.setItem('kitly-cart', JSON.stringify(next));
          setLines(next);
        },
        purchased: (purchased) => {
          const next = subtractPurchased(lines, purchased);
          localStorage.setItem('kitly-cart', JSON.stringify(next));
          setLines(next);
        },
        add: (line) =>
          setLines((old) => {
            const found = old.find((l) => l.product.id === line.product.id);
            return found
              ? old.map((l) =>
                  l.product.id === line.product.id
                    ? {
                        ...l,
                        quantity: Math.min(
                          l.quantity + line.quantity,
                          line.product.stock,
                        ),
                      }
                    : l,
                )
              : [...old, line];
          }),
        quantity: (id, count) =>
          setLines((old) =>
            old
              .map((l) =>
                l.product.id === id
                  ? { ...l, quantity: Math.min(count, l.product.stock) }
                  : l,
              )
              .filter((l) => l.quantity > 0),
          ),
        clear: () => setLines([]),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useCart() {
  const cart = useContext(Context);
  if (!cart) throw new Error('CartProvider required');
  return cart;
}
