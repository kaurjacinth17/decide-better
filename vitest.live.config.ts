import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Opt-in: calls the real Anthropic API (costs a few cents). Run with `pnpm test:live`.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['tests/live/**/*.test.ts'], environment: 'node', testTimeout: 120_000 },
});
