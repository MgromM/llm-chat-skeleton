import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

// Sales&More brand palette (BrandGuidelines-Sales&More v3.pdf)
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#29272E',
          orange: '#F8502C',
          white: '#FFFFFF',
          lavender: '#EDEDF5',
          purple: '#5A54BE',
          blue: '#9DB0DF',
          magenta: '#D74AD6',
        },
      },
      fontFamily: {
        sans: ['Segoe UI', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [typography],
};

export default config;
