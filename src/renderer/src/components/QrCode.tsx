import { useMemo } from 'react'
import { qrMatrix } from './qr'

// Rendert einen QR-Code als gestochen scharfes SVG (ein <rect> je dunklem Modul),
// inkl. Ruhezone. Bei zu langem Text (sollte bei LAN-URLs nie passieren) -> null.
export function QrCode({ text, size = 150 }: { text: string; size?: number }): JSX.Element | null {
  const matrix = useMemo(() => qrMatrix(text), [text])
  if (!matrix) return null
  const n = matrix.length
  const quiet = 4
  const total = n + quiet * 2
  const rects: JSX.Element[] = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        rects.push(
          <rect key={`${r}-${c}`} x={c + quiet} y={r + quiet} width={1} height={1} fill="#000" />
        )
      }
    }
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${total} ${total}`}
      shapeRendering="crispEdges"
      style={{ background: '#fff', borderRadius: 6, flex: '0 0 auto' }}
    >
      {rects}
    </svg>
  )
}
