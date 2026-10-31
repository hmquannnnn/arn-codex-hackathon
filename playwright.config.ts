import { defineConfig } from '@playwright/test';
const credentials = process.env.KITLY_BASIC_AUTH;
const colon = credentials?.indexOf(':') ?? -1;
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    ...(credentials && colon >= 0
      ? {
          httpCredentials: {
            username: credentials.slice(0, colon),
            password: credentials.slice(colon + 1),
          },
        }
      : {}),
  },
  outputDir: 'e2e/artifacts',
});
