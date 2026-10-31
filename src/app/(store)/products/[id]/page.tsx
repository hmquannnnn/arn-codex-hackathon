import { ProductDetail } from '@/components/store/product-detail';
import { today } from '@/server/today';
export const dynamic = 'force-dynamic';
export default async function Product({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductDetail id={id} today={today()} />;
}
