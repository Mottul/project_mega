// ESLint-Flat-Config: TypeScript (main/preload/renderer/shared) + React-Hooks.
// Bewusst OHNE type-aware Linting (schnell, kein tsconfig-Projekt nötig) und
// mit eslint-config-prettier am Ende, damit Formatfragen allein Prettier gehören.
// Gelintet wird der Quellcode; Build-Skripte, Skill-Helfer (.claude/) und JS-Configs bleiben
// außen vor.

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: [
      'out/**',
      'out-pwa/**',
      'dist/**',
      'node_modules/**',
      'build/**',
      'resources/**',
      'scripts/**',
      '.claude/**',
      'e2e/**',
      'vendor/**',
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
  {
    // Im main-Prozess nie synchron auf einen Prozess warten: Solange er läuft, nehmen die Fenster
    // keine Klicks an und jede IPC-Anfrage hängt (yt-dlp --version: 1,5–2 s kurz nach dem Start).
    // Tests und Labor-Skripte dürfen. Kanäle nur über ipc/kanal.ts: Sonst prüft niemand den Handler
    // gegen den Vertrag.
    files: ['src/main/**/*.ts'],
    ignores: ['**/*.test.ts', 'src/main/ipc/kanal.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        ...['node:child_process', 'child_process'].map((name) => ({
          name,
          importNames: ['spawnSync', 'execSync', 'execFileSync'],
          message: 'Blockiert den main-Prozess – asynchron starten (Version: binaryVersion()).'
        })),
        {
          name: 'electron',
          importNames: ['ipcMain'],
          message: 'Kanäle über handle()/on() aus ipc/kanal.ts anmelden (typisiert per Vertrag).'
        }
      ]
    }
  },
  prettier
)
