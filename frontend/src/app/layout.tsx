import type { Metadata } from 'next';
import { Inter, Anton } from 'next/font/google';
import { AuthProvider } from '@/lib/AuthContext';
import { ThemeProvider } from '@/components/ThemeProvider';
import './globals.css';

// Free stand-ins for the licensed brand fonts (Lazare Grotesk / PP Formula),
// which we don't hold font files for — see tailwind.config.ts.
const inter = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-inter' });
const anton = Anton({ subsets: ['latin', 'latin-ext'], weight: '400', variable: '--font-anton' });

export const metadata: Metadata = {
  title: 'Sales&More LLM',
  description: 'Wewnętrzny asystent AI dla specjalistów Sales&More',
  icons: { icon: '/logo-salesmore.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className={`${inter.variable} ${anton.variable}`}>
      <body className="bg-brand-white dark:bg-zinc-950">
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
