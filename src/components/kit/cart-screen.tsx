'use client';
import { KitWorkspace } from './screen';
/** Dedicated cart experience; only the conversation/pricing workspace mechanics are shared. */
export function CartKitScreen({
  id,
  query,
  today,
}: {
  id?: string;
  query?: string;
  today: string;
}) {
  return (
    <KitWorkspace
      id={id}
      query={query}
      today={today}
      initialSource="cart_only"
    />
  );
}
