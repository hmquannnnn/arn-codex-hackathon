import { basketOptionSchema, kitSelectionSchema } from '@/contract/schemas';
import type { KitVersion } from '@/contract/types';

// Internal JSON storage metadata: reuse the existing atomic selection RPC and frozen public contract.
export const storedSelectionSchema = kitSelectionSchema.extend({
  snapshot: basketOptionSchema.optional(),
});
export function hasPricedSelection(version: KitVersion) {
  const selection = version.selection;
  if (!selection) return true;
  const option = version.options.find((o) => o.profile === selection.profile);
  return (
    !!option &&
    Object.entries(selection.picks).every(([key, id]) =>
      option.lines.some(
        (line) => line.itemKey === key && line.product.id === id,
      ),
    ) &&
    selection.dropped.every(
      (key) => !option.lines.some((line) => line.itemKey === key),
    )
  );
}
