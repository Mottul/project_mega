import { describe, expect, it, vi } from 'vitest'
import { istVollbild, kannVollbild, setzeVollbild, type VollbildDokument } from './vollbild'

/** Ersatz fürs Dokument (Vitest läuft ohne DOM) – `an`: steht schon ein Element im Vollbild? */
function dokument(an: boolean): {
  doc: VollbildDokument
  request: ReturnType<typeof vi.fn>
  exit: ReturnType<typeof vi.fn>
} {
  const request = vi.fn(async () => undefined)
  const exit = vi.fn(async () => undefined)
  const doc: VollbildDokument = {
    fullscreenEnabled: true,
    fullscreenElement: an ? ({} as Element) : null,
    exitFullscreen: exit,
    documentElement: { requestFullscreen: request }
  }
  return { doc, request, exit }
}

describe('Vollbild der Rechner-PWA', () => {
  it('nur wo der Browser es anbietet – am iPhone fehlt die Eigenschaft ganz', () => {
    expect(kannVollbild({})).toBe(false)
    expect(kannVollbild({ fullscreenEnabled: undefined })).toBe(false)
    expect(kannVollbild({ fullscreenEnabled: false })).toBe(false)
    expect(kannVollbild({ fullscreenEnabled: true })).toBe(true)
  })

  it('erkennt das Vollbild am Element, das es gerade zeigt', () => {
    expect(istVollbild(dokument(false).doc)).toBe(false)
    expect(istVollbild(dokument(true).doc)).toBe(true)
  })

  it('schaltet die ganze Seite ein und bittet Android, die Navigationsleiste auszublenden', async () => {
    const { doc, request, exit } = dokument(false)
    await setzeVollbild(doc, true)
    expect(request).toHaveBeenCalledWith({ navigationUI: 'hide' })
    expect(exit).not.toHaveBeenCalled()
  })

  it('schaltet aus', async () => {
    const { doc, request, exit } = dokument(true)
    await setzeVollbild(doc, false)
    expect(exit).toHaveBeenCalledOnce()
    expect(request).not.toHaveBeenCalled()
  })

  it('tut nichts, wenn es schon so ist – exitFullscreen ohne Vollbild würde abgelehnt', async () => {
    const aus = dokument(false)
    await setzeVollbild(aus.doc, false)
    expect(aus.exit).not.toHaveBeenCalled()
    const an = dokument(true)
    await setzeVollbild(an.doc, true)
    expect(an.request).not.toHaveBeenCalled()
  })
})
