import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { pwaPlugins } from './src/pwa/build/plugin'

// Rechner-PWA: die kleinen Werkzeuge (Rechner) als eigenständige Web-App fürs Handy – derselbe
// Code wie in der Desktop-App, aber ohne Electron (src/pwa, docs/ENTWICKLUNG.md).
// base './' -> läuft in jedem Unterordner (z. B. GitHub Pages unter /<repo>/).
export default defineConfig({
  root: resolve('src/pwa'),
  base: './',
  publicDir: resolve('src/pwa/public'),
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  plugins: [react(), ...pwaPlugins()],
  build: {
    outDir: resolve('out-pwa'),
    emptyOutDir: true
  },
  server: { port: 5180 },
  preview: { port: 5181 }
})
