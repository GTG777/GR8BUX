import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'GR8BUX',
  description: 'GR8BUX — Professional trading journal and market analysis platform for stocks and options',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
        <main>{children}</main>
      </body>
    </html>
  );
}
