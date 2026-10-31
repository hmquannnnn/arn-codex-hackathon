import type { Config } from 'tailwindcss';
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: { extend: { colors: { accent: '#EE4D2D' } } },
  plugins: [],
} satisfies Config;
