import type { Metadata, Viewport } from 'next';
import { Inter, Anton } from 'next/font/google';
import { AuthProvider } from '@/lib/AuthContext';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import { LocaleProvider } from '@/lib/LocaleContext';
import './globals.css';

// Free stand-ins for the licensed brand fonts (Lazare Grotesk / PP Formula),
// which we don't hold font files for — see tailwind.config.ts.
const inter = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-inter' });
const anton = Anton({ subsets: ['latin', 'latin-ext'], weight: '400', variable: '--font-anton' });

export const metadata: Metadata = {
  title: 'LLM Chat App',
  description: 'AI chat assistant',
  manifest: '/manifest.json',
  // TODO: add your own logo (e.g. frontend/public/logo.png) and set
  // icons.icon accordingly — omitted here since the placeholder logo file
  // was removed.
  icons: {
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'LLM Chat App',
  },
};

export const viewport: Viewport = {
  themeColor: '#232A38',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className={`${inter.variable} ${anton.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-brand-white dark:bg-zinc-950">
        <ThemeProvider>
          <LocaleProvider>
            <AuthProvider>{children}</AuthProvider>
          </LocaleProvider>
        </ThemeProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
