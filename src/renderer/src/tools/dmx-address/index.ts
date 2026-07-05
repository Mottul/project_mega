import { lazy } from 'react'
import { Binary } from 'lucide-react'
import type { ToolModule } from '../types'

export const dmxAddressTool: ToolModule = {
  id: 'dmx-address',
  name: 'DMX-Dip-Schalter',
  description: 'DMX-Startadresse in Dip-Schalter umrechnen und zurück (Binär, 9 Schalter, 1–512).',
  icon: Binary,
  category: 'control',
  keywords: [
    'dmx',
    'dip',
    'dipswitch',
    'dip-schalter',
    'adresse',
    'binär',
    'binary',
    'licht',
    'lighting',
    '512'
  ],
  component: lazy(() => import('./DmxAddress').then((m) => ({ default: m.DmxAddress })))
}
