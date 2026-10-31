import { KitScreen } from '@/components/kit/screen';
import { today } from '@/server/today';
export const dynamic = 'force-dynamic';
export default async function KitThread({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <KitScreen id={id} today={today()} />;
}
