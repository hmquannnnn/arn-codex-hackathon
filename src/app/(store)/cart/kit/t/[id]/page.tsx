import { CartKitScreen } from '@/components/kit/cart-screen';
import { today } from '@/server/today';
export const dynamic = 'force-dynamic';
export default async function CartKitThread({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CartKitScreen id={id} today={today()} />;
}
