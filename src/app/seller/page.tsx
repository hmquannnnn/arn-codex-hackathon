import { SellerScreen } from '@/components/seller/screen';
export default async function Seller({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string }>;
}) {
  const { shop } = await searchParams;
  return <SellerScreen initialShop={shop || 'all'} />;
}
