import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Unit-Tests für die reinen Rechen-/Logik-Module (kein Electron, keine DOM).
// Alias-Auflösung spiegelt electron.vite.config.ts, damit Tests dieselben
// @shared/@renderer-Importe nutzen können wie die App.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}']
  }
})
