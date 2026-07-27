import './globals.css';
import type { Metadata } from 'next';
import Header from '@/components/header';
import { NotificationsProvider } from '@/components/ui/notifications';

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
        <NotificationsProvider>
          <Header />
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
        </NotificationsProvider>
      </body>
    </html>
  );
}