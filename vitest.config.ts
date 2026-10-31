import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
if (existsSync('.env.local')) loadEnvFile('.env.local');
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['tests/server/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['tests/ui/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
