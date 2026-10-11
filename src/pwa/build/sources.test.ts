import { describe, expect, it } from 'vitest'
import { inSources, pwaSources, tailwindContent } from './sources'

describe('Tailwind-Quellen der Rechner-PWA', () => {
  const src = pwaSources('/p', ['timecode', 'rigging'])

  it('nimmt PWA, Rechner und ihre Bausteine – nicht den ganzen Renderer', () => {
    expect(src).toContain('/p/src/pwa')
    expect(src).toContain('/p/src/renderer/src/tools/timecode')
    expect(src).toContain('/p/src/renderer/src/tools/_calc')
    expect(src).not.toContain('/p/src/renderer/src')
    expect(inSources('/p/src/renderer/src/tools/led-wall/LedWall.tsx', src)).toBe(false)
    expect(inSources('/p/src/renderer/src/components/ToolShell.tsx', src)).toBe(false)
  })

  it('erkennt Dateien in den Quellen, auch mit Windows-Pfaden und Abfrage-Anhang', () => {
    expect(inSources('/p/src/renderer/src/tools/timecode/Timecode.tsx', src)).toBe(true)
    expect(inSources('C:\\p\\x.ts', pwaSources('C:\\p', []))).toBe(false)
    expect(inSources('C:\\p\\src\\pwa\\App.tsx', pwaSources('C:\\p', []))).toBe(true)
    expect(inSources('/p/src/renderer/src/components/ui/button.tsx?v=1', src)).toBe(true)
  })

  it('ein Ordnername als Anfang eines anderen zählt nicht (rigging ≠ rigging-plan)', () => {
    expect(inSources('/p/src/renderer/src/tools/rigging-plan/X.tsx', src)).toBe(false)
  })

  it('Ordner werden zu Globs, Dateien bleiben', () => {
    const content = tailwindContent(src)
    expect(content).toContain('/p/src/pwa/**/*.{html,ts,tsx}')
    expect(content).toContain('/p/src/renderer/src/components/ErrorBoundary.tsx')
    expect(content).toContain('!**/*.test.{ts,tsx}')
  })
})
