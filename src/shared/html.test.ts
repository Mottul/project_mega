import { describe, expect, it } from 'vitest'
import { esc, safeHref } from './html'

describe('esc', () => {
  it('maskiert Tags und beide Anführungszeichen', () => {
    expect(esc(`<img src=x onerror="a('b')">&`)).toBe(
      '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;'
    )
  })
  it('Zahlen und leere Werte', () => {
    expect(esc(42)).toBe('42')
    expect(esc(null)).toBe('')
    expect(esc(undefined)).toBe('')
  })
})

describe('safeHref', () => {
  it('lässt nur https, tel und mailto zu', () => {
    expect(safeHref('https://wa.me/4366412345')).toBe('https://wa.me/4366412345')
    expect(safeHref(' tel:+43 664 12345')).toBe('tel:+43 664 12345')
    expect(safeHref('mailto:a@b.at')).toBe('mailto:a@b.at')
    expect(safeHref('javascript:alert(1)')).toBe('#')
    expect(safeHref('http://example.com')).toBe('#')
    expect(safeHref('file:///C:/x')).toBe('#')
    expect(safeHref('https://x"onmouseover="y')).toBe('https://x&quot;onmouseover=&quot;y')
  })
})
