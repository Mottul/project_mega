// Darstellung der Ampel-Stufen (Badge-Ton, Icon, Textfarbe) – gemeinsam für
// Medien-Info und Video-Konverter, aus der gemeinsamen Status-Tabelle.

import { STATUS } from '@renderer/components/ui/status'
import type { HintLevel } from './hints'

export const LEVEL_META: Record<HintLevel, { label: string } & (typeof STATUS)['info']> = {
  problem: { label: 'Problem', ...STATUS.danger },
  warning: { label: 'Warnung', ...STATUS.warning },
  info: { label: 'Info', ...STATUS.info },
  ok: { label: 'OK', ...STATUS.success }
}
