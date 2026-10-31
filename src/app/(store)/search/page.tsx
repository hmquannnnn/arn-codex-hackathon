import { Catalog } from '@/components/store/catalog';
export default async function Search({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return <Catalog query={q || ''} />;
}
