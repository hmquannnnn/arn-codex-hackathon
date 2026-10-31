import { Package } from 'lucide-react';
export default function Home() {
  return (
    <main className="mx-auto mt-24 max-w-xl rounded-2xl bg-white p-10 shadow-sm">
      <Package className="mb-4 text-accent" size={40} />
      <h1 className="text-3xl font-semibold">Kitly</h1>
      <p className="mt-3 text-slate-600">
        Tell Kitly your need, get the whole kit.
      </p>
      <p className="mt-6 text-sm text-slate-500">
        DemoMart · Built during the hackathon
      </p>
    </main>
  );
}
