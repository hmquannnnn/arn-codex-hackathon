import type { Product } from '@/contract/types';
export interface Addition {
  titleSuffix: string;
  tags: string[];
  attributes: Record<string, string>;
  descriptionAppend: string;
}
export function mergeEnrichment(listing: Product, proposal: Addition): Product {
  const suffix = proposal.titleSuffix
    .trim()
    .slice(0, Math.max(0, 120 - listing.title.length - 3))
    .trim();
  const seen = listing.description.toLocaleLowerCase();
  const append = proposal.descriptionAppend
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((s) => s.trim())
    .filter((s) => s && !seen.includes(s.toLocaleLowerCase()))
    .join(' ');
  return {
    ...listing,
    title: suffix ? `${listing.title} | ${suffix}` : listing.title,
    tags: [...new Set([...listing.tags, ...proposal.tags])],
    attributes: { ...proposal.attributes, ...listing.attributes },
    description: append
      ? `${listing.description}\n\n${append}`
      : listing.description,
  };
}
export function keywordCheck(before: Product, after: Product) {
  return [
    ...new Set(
      before.title
        .toLocaleLowerCase()
        .split(/[^\p{L}\p{N}-]+/u)
        .filter((t) => t.length >= 3),
    ),
  ].map((keyword) => ({
    keyword,
    stillMatches: after.title.toLocaleLowerCase().includes(keyword),
  }));
}
