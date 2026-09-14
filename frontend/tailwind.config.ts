import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

// Sales&More brand palette — verified against BrandGuidelines-Sales&More v3.pdf
// and the shared brand-book (colors confirmed on real reference files).
// Orange is the ONLY strong accent; use it sparingly, not everywhere.
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#29272E', // primary text, headings
          muted: '#636372', // secondary text, labels, captions
          orange: '#F8502C', // the single strong accent color
          white: '#FFFFFF', // page background — always white
          surface: '#F5F5FA', // non-highlighted card background
          border: '#EDEDF1', // hairline separators
          positive: '#20BF55', // growth / good trend indicator
        },
      },
      fontFamily: {
        // Brand font is Segoe UI (native on Windows, where the team works).
        // Selawik is Microsoft's free metric-compatible substitute for
        // non-Windows rendering (SIL OFL, files in public/fonts).
        sans: ['"Segoe UI"', 'Selawik', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(41, 39, 46, 0.04), 0 8px 24px -12px rgba(41, 39, 46, 0.12)',
      },
    },
  },
  plugins: [typography],
};

export default config;
