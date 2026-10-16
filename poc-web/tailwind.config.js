/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#059669', dark: '#047857', soft: '#ecfdf5', line: '#a7f3d0' },
        ink: { DEFAULT: '#1f2937', muted: '#6b7280', faint: '#9ca3af' },
      },
      fontFamily: { sans: ['"Noto Sans TC"', '"PingFang TC"', '"Microsoft JhengHei"', 'system-ui', 'sans-serif'] },
      boxShadow: { card: '0 4px 18px rgba(15, 23, 42, 0.08)' },
    },
  },
  plugins: [],
}
