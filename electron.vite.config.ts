import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// main + preload werden als CommonJS gebaut (kein "type":"module" in package.json),
// damit better-sqlite3 (nativ, CJS) per require und pdfjs-dist (ESM) per dynamischem
// import() problemlos genutzt werden koennen. Beide sind in `dependencies` und werden
// via externalizeDepsPlugin NICHT gebundelt, sondern zur Laufzeit aus node_modules geladen.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})
