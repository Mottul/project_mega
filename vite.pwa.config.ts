import { createRequire } from 'node:module'
import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import autoprefixer from 'autoprefixer'
import tailwindcss, { type Config } from 'tailwindcss'
import { SMALL_TOOLS } from './src/shared/toolWindows'
import { pwaPlugins } from './src/pwa/build/plugin'
import { pwaSources, tailwindContent } from './src/pwa/build/sources'

// Farben, Theme & Co. wie in der App – aber Klassen nur aus dem, was die PWA einbindet
const appTailwind = createRequire(import.meta.url)('./tailwind.config.js') as Config
const sources = pwaSources(resolve('.'), Object.keys(SMALL_TOOLS))

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
  css: {
    postcss: {
      plugins: [tailwindcss({ ...appTailwind, content: tailwindContent(sources) }), autoprefixer()]
    }
  },
  plugins: [react(), ...pwaPlugins({ sources, rendererRoot: resolve('src/renderer/src') })],
  build: {
    outDir: resolve('out-pwa'),
    emptyOutDir: true
  },
  server: { port: 5180 },
  preview: { port: 5181 }
})
