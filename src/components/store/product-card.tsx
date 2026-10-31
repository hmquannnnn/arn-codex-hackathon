import Link from 'next/link';
import { icons, Package, Star } from 'lucide-react';
import type { Product, Shop } from '@/contract/types';
import { categories } from '@/contract/taxonomy';
import { money } from '@/lib/client/store';
export function CategoryTile({
  category,
  large = false,
}: {
  category: string;
  large?: boolean;
}) {
  const meta = categories.find((c) => c.id === category);
  const name = meta?.icon.replace(/(^|-)(\w)/g, (_, __, letter: string) =>
    letter.toUpperCase(),
  );
  const Icon = icons[name as keyof typeof icons] || Package;
  return (
    <div
      className={`flex items-center justify-center rounded-2xl ${large ? 'h-64' : 'h-36'} ${meta?.color || 'bg-orange-50 text-orange-600'}`}
    >
      <Icon size={large ? 96 : 54} strokeWidth={1.3} />
    </div>
  );
}
export function ProductCard({
  product,
  shop,
  hasVoucher = false,
}: {
  product: Product;
  shop: Shop;
  hasVoucher?: boolean;
}) {
  return (
    <Link
      href={`/products/${product.id}`}
      className="block rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-orange-400 hover:shadow-md"
    >
      <CategoryTile category={product.category} />
      <div className="mt-3 flex flex-wrap gap-1 text-xs font-medium">
        {shop.tier !== 'regular' && (
          <span className="rounded bg-orange-50 px-2 py-1 text-orange-700">
            {shop.tier === 'mall' ? 'Mall' : 'Preferred'}
          </span>
        )}
        {hasVoucher && (
          <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">
            Shop voucher
          </span>
        )}
      </div>
      <h3 className="mt-2 line-clamp-2 min-h-12 text-sm font-medium">
        {product.title}
      </h3>
      <p className="mt-2 text-lg font-bold text-accent">
        {money(product.price)}
      </p>
      <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
        <Star size={13} className="fill-amber-400 text-amber-400" />{' '}
        {product.rating} · {product.reviewCount} reviews
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {product.soldCount.toLocaleString('en-US')} sold · {shop.name}
      </p>
      {product.updatedForDemandAt && (
        <span className="mt-2 inline-block rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
          Updated for this need
        </span>
      )}
    </Link>
  );
}
