import { KitScreen } from '@/components/kit/screen';
import { today } from '@/server/today';
export const dynamic = 'force-dynamic';
export default async function NewKit({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return <KitScreen query={q} today={today()} />;
}
