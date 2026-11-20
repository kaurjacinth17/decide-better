import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'prototype/**', 'public/sw.js', 'playwright-report/**', 'test-results/**', 'next-env.d.ts'] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  prettier,
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['react', 'react-dom', 'next', 'next/*', 'zustand', 'dexie', '@/store/*', '@/components/*'] },
      ],
    },
  },
];

export default config;
