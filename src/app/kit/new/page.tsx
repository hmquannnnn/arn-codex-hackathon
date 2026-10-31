import { redirect } from 'next/navigation';
import { KitScreen } from '@/components/kit/screen';
import { today } from '@/server/today';
export const dynamic = 'force-dynamic';
export default async function NewKit({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; source?: string }>;
}) {
  const { q, source } = await searchParams;
  if (source === 'cart_only')
    redirect(`/cart/kit/new${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  return <KitScreen query={q} today={today()} />;
}
