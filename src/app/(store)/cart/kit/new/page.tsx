import { CartKitScreen } from '@/components/kit/cart-screen';
import { today } from '@/server/today';
export const dynamic = 'force-dynamic';
export default async function NewCartKit({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return <CartKitScreen query={q} today={today()} />;
}
