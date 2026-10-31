import { Catalog } from '@/components/store/catalog';
export default async function Category({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Catalog category={id} />;
}
