// ESLint-Flat-Config: TypeScript (main/preload/renderer/shared) + React-Hooks.
// Bewusst OHNE type-aware Linting (schnell, kein tsconfig-Projekt nötig) und
// mit eslint-config-prettier am Ende, damit Formatfragen allein Prettier gehören.
// Gelintet wird der Quellcode; Build-Skripte/JS-Configs bleiben außen vor.

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: [
      'out/**',
      'dist/**',
      'node_modules/**',
      'build/**',
      'resources/**',
      'scripts/**',
      'vendor/**',
      // statische Assets (AudioWorklet läuft im Worklet-Scope mit eigenen Globals)
      'src/renderer/public/**',
      '*.config.js',
      '*.config.mjs'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Ungenutztes ist ein Fehler; per _-Präfix bewusst ignorierbar.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
      ]
    }
  },
  prettier
)
