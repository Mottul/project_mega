import { lazy } from 'react'
import { ChartColumnBig } from 'lucide-react'
import type { ToolModule } from '../types'

export const rtaTool: ToolModule = {
  id: 'rta',
  name: 'RTA (Echtzeit-Analysator)',
  description:
    'Spektrum übers Mikrofon in Terzen bis 1/12 Oktave, Pegel in dB(A/C), Referenzkurven und Feedback-Finder – auch am Handy.',
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
    'eq'
  ],
  component: lazy(() => import('./Rta').then((m) => ({ default: m.Rta })))
}
