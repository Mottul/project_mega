import { lazy } from 'react'
import { ChartColumnBig } from 'lucide-react'
import type { ToolModule } from '../types'

export const rtaTool: ToolModule = {
  id: 'rta',
  name: 'RTA (Echtzeit-Analysator)',
  description: 'Spektrum und Pegel übers Mikrofon',
  icon: ChartColumnBig,
  category: 'calc',
  keywords: [
    'rta',
    'analyzer',
    'analysator',
    'spektrum',
    'spectrum',
    'fft',
    'terz',
    'oktave',
    'third octave',
    'pink noise',
    'rosa rauschen',
    'feedback',
    'rückkopplung',
    'pfeifen',
    'einmessen',
    'spl',
    'pegel',
    'schalldruck',
    'db',
    'dba',
    'leq',
    'mikrofon',
    'messmikrofon',
    'umik',
    'kalibrieren',
    'spektrogramm',
    'wasserfall',
    'eq',
    'terzen',
    'referenzkurven',
    'feedback-finder',
    'handy'
  ],
  component: lazy(() => import('./Rta').then((m) => ({ default: m.Rta })))
}
