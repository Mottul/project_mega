// Draufsicht in der App – rendert exakt dasselbe SVG-Markup wie der PDF-Export
// (gemeinsamer Builder in topdown.ts), damit Vorschau und Doku identisch sind.

import { topDownMarkup, type TopDownOptions } from './topdown'

interface Props extends TopDownOptions {
  angles: number[]
}

export function TopDownSvg({ angles, ...opts }: Props): JSX.Element {
  if (!angles.length) {
    return <p className="text-xs text-muted-foreground">Keine Module definiert.</p>
  }
  return <div className="w-full [&>svg]:mx-auto" dangerouslySetInnerHTML={{ __html: topDownMarkup(angles, opts) }} />
}
