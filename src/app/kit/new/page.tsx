import { KitScreen } from '@/components/kit/screen';
import { today } from '@/server/today';
export const dynamic = 'force-dynamic';
export default async function NewKit({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; source?: string }>;
}) {
  const { q, source } = await searchParams;
  return (
    <KitScreen
      query={q}
      initialSource={source === 'cart_only' ? 'cart_only' : 'catalog'}
      today={today()}
    />
  );
}
