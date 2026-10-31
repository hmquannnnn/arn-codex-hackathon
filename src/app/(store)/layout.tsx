import { CartProvider } from '@/components/store/cart-context';
import { StoreHeader } from '@/components/store/header';
export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CartProvider>
      <StoreHeader />
      <main className="mx-auto min-h-[70vh] max-w-7xl px-5 py-8">
        {children}
      </main>
      <footer className="border-t px-5 py-8 text-center text-xs text-slate-500">
        DemoMart · Everyday needs, thoughtfully together. Powered by Kitly.
      </footer>
    </CartProvider>
  );
}
