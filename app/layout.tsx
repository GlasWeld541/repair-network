import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Header from '@/components/header';
import { NotificationsProvider } from '@/components/ui/notifications';

// Inter, exposed as --font-sans, so both this app and Rex render the same font on every
// device (see tailwind.config.ts fontFamily.sans). Self-hosted by next/font — no CLS.
const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

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
    <html lang="en" className={inter.variable}>
      <body className="bg-slate-50 text-slate-900">
        <NotificationsProvider>
          <Header />
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
        </NotificationsProvider>
      </body>
    </html>
  );
}