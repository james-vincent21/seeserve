import type { Metadata } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import Link from 'next/link';
import { ChatWidget } from '@/components/chat-widget';
import './globals.css';

const display = Fraunces({ subsets: ['latin'], variable: '--font-display', weight: ['400', '600'] });
const body = Inter({ subsets: ['latin'], variable: '--font-body' });

export const metadata: Metadata = {
  title: 'Dhaka Table House',
  description: 'Kacchi, kebabs and Bengali classics in Gulshan, Dhanmondi and Uttara. Book a table or join the queue online.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <body>
        <header className="site-header">
          <Link href="/" className="logo">Dhaka <em>Table</em> House</Link>
          <nav>
            <Link href="/menu">Menu</Link>
            <Link href="/#branches">Branches</Link>
            <Link href="/ticket">My ticket</Link>
            <Link href="/reserve" className="cta">Book a table</Link>
          </nav>
        </header>
        {children}
        <footer className="site-footer">
          <p>Dhaka Table House is a fictional restaurant used to demonstrate SeeServe. Sales data shown in the dashboard is synthetic.</p>
          <p>Privacy: our cameras only count people at tables — no video is stored. Booking emails are used only for your ticket.</p>
        </footer>
        <ChatWidget />
      </body>
    </html>
  );
}
