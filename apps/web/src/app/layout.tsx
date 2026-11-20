import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Restaurant Vision',
  description: 'Restaurant floor intelligence demo dashboard',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Browser extensions (for example, QuillBot) inject attributes into <html> before hydration.
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}
