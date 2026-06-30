import { lazy } from 'react'
import { Circle } from 'lucide-react'
import type { ToolModule } from '../types'

export const circleCalcTool: ToolModule = {
  id: 'circle-calc',
  name: 'Kreisrechner',
  description:
    'Durchmesser, Radius, Umfang und Fläche eines Kreises – einen Wert eingeben, Rest berechnen.',
  icon: Circle,
  category: 'calc',
  keywords: [
    'kreis',
    'durchmesser',
    'radius',
    'umfang',
    'fläche',
    'flaeche',
    'circle',
    'pi',
    'geometrie'
  ],
  component: lazy(() => import('./CircleCalc').then((m) => ({ default: m.CircleCalc })))
}
