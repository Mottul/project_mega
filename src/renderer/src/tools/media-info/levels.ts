// Darstellung der Ampel-Stufen (Badge-Ton, Icon, Textfarbe) – gemeinsam für
// Medien-Info und Video-Konverter.

import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import type { BadgeTone } from '@renderer/components/ui/badge'
import type { HintLevel } from './hints'

export const LEVEL_META: Record<
  HintLevel,
  { label: string; tone: BadgeTone; icon: typeof Info; className: string }
> = {
  problem: {
    label: 'Problem',
    tone: 'danger',
    icon: XCircle,
    className: 'text-danger'
  },
  warning: {
    label: 'Warnung',
    tone: 'warning',
    icon: AlertTriangle,
    className: 'text-warning'
  },
  // Info bewusst neutral: der Ton „info" folgt der wählbaren Akzentfarbe und sähe
  // bei orangem Akzent wie eine Warnung aus.
  info: { label: 'Info', tone: 'neutral', icon: Info, className: 'text-muted-foreground' },
  ok: {
    label: 'OK',
    tone: 'success',
    icon: CheckCircle2,
    className: 'text-success'
  }
}
