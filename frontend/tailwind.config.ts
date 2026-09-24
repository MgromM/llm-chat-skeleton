import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

// Brand palette — customize for your project
// and the shared brand-book (colors confirmed on real reference files).
// Orange is the ONLY strong accent; use it sparingly, not everywhere.
const config: Config = {
  darkMode: 'class',
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
        // Brand body font per BrandGuidelines is Lazare Grotesk. We don't
        // hold a license/font files for it, so we use Inter — the closest
        // free equivalent (same clean geometric grotesk proportions) —
        // loaded via next/font/google in app/layout.tsx.
        sans: ['var(--font-inter)', 'system-ui', '-apple-system', 'sans-serif'],
        // Brand headline font per BrandGuidelines is PP Formula (tall,
        // condensed, bold display grotesk). Anton is the closest free
        // equivalent, loaded via next/font/google in app/layout.tsx.
        display: ['var(--font-anton)', 'system-ui', '-apple-system', 'sans-serif'],
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
