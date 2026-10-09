import { describe, expect, it } from 'vitest'
import { isSmallTool, restoreBounds, toolWindowSize, TOOL_WINDOW } from './toolWindows'

const screen = { x: 0, y: 0, width: 1920, height: 1040 }
const right = { x: 1920, y: 0, width: 1920, height: 1040 }

describe('toolWindowSize', () => {
  it('gibt kleinen Werkzeugen ein kleines Fenster mit kleinem Mindestmaß', () => {
    const s = toolWindowSize('timecode')
    expect(s.width).toBeLessThan(TOOL_WINDOW.width)
    expect(s.minWidth).toBeLessThan(TOOL_WINDOW.minWidth)
    expect(s.minHeight).toBeLessThan(TOOL_WINDOW.minHeight)
    expect(isSmallTool('timecode')).toBe(true)
  })

  it('lässt große und unbekannte Werkzeuge beim normalen Fenster', () => {
    expect(toolWindowSize('video-player')).toEqual(TOOL_WINDOW)
    expect(isSmallTool('video-player')).toBe(false)
    expect(isSmallTool('toString')).toBe(false)
  })
})

describe('restoreBounds', () => {
  const size = toolWindowSize('circle-calc')

  it('übernimmt eine Lage auf einem vorhandenen Bildschirm', () => {
    expect(
      restoreBounds({ x: 2100, y: 80, width: 520, height: 400 }, [screen, right], size)
    ).toEqual({ x: 2100, y: 80, width: 520, height: 400 })
  })

  it('verwirft eine Lage auf einem abgesteckten Bildschirm', () => {
    expect(restoreBounds({ x: 2100, y: 80, width: 520, height: 400 }, [screen], size)).toBeNull()
  })

  it('hält die Größe zwischen Mindestmaß und Arbeitsfläche', () => {
    expect(restoreBounds({ x: 10, y: 10, width: 300, height: 5000 }, [screen], size)).toEqual({
      x: 10,
      y: 10,
      width: size.minWidth,
      height: screen.height
    })
  })

  it('ignoriert kaputte Werte aus settings.json', () => {
    expect(restoreBounds(null, [screen], size)).toBeNull()
    expect(restoreBounds({ x: 'a', y: 0, width: 500, height: 400 }, [screen], size)).toBeNull()
    expect(restoreBounds({ x: NaN, y: 0, width: 500, height: 400 }, [screen], size)).toBeNull()
  })
})
