// ESLint flat config for the backend workspace.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The codebase deliberately uses `unknown` + narrow checks for
      // cross-boundary data (env, RPC, request bodies).
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['tests/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // Startup/shutdown lifecycle messages are intentional server output.
    files: ['src/server.ts', 'src/app.ts', 'src/blockchain/adminRegistry.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
