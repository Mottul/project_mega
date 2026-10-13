// Statusstufen einheitlich darstellen: Symbol, Schriftfarbe und Badge-Ton je Stufe – eine
// Tabelle für Toasts, Hinweise (Medien-Info, Video-Konverter) und den Video-Generator.
// Werkzeuge benennen ihre Stufen selbst (problem/error …) und bilden sie hierauf ab.

import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react'
import type { BadgeTone } from './badge'

export type StatusTone = 'danger' | 'warning' | 'info' | 'success'

export const STATUS: Record<StatusTone, { icon: LucideIcon; className: string; tone: BadgeTone }> =
  {
    danger: { icon: XCircle, className: 'text-danger', tone: 'danger' },
    warning: { icon: AlertTriangle, className: 'text-warning', tone: 'warning' },
    // Info bewusst neutral: Der Ton „info“ folgt der wählbaren Akzentfarbe und sähe bei orangem
    // Akzent wie eine Warnung aus.
    info: { icon: Info, className: 'text-muted-foreground', tone: 'neutral' },
    success: { icon: CheckCircle2, className: 'text-success', tone: 'success' }
  }
