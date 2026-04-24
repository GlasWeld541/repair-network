import './globals.css';
import type { Metadata } from 'next';
import Header from '@/components/header';

export const metadata: Metadata = {
  title: 'GlasWeld Repair Network',
  description: 'Internal network management for repair-only insurance claim routing.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900">
        <Header />
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}