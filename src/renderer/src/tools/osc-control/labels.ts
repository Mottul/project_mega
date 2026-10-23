// Beschriftungen der Kachel-Arten und NovaStar-Funktionen – ohne den Store, damit auch reine
// Module sie nutzen können (Übernahme ins Mini-Manual, Tests ohne Fenster).

import type { NovaFn, OscWidgetType } from './store'

export const WIDGET_TYPE_LABEL: Record<OscWidgetType, string> = {
  fader: 'Fader',
  button: 'Taster',
  toggle: 'Schalter',
  xy: 'XY-Pad',
  color: 'Farbe',
  label: 'Label',
  meter: 'Anzeige',
  select: 'Auswahl',
  bank: 'Bank',
  knob: 'Poti'
}

export const NOVA_FN_LABEL: Record<NovaFn, string> = {
  brightness: 'Helligkeit (Fader)',
  brightnessSet: 'Helligkeit setzen',
  brightnessStep: 'Helligkeit ±',
  fadeToBlack: 'Fade to Black',
  freeze: 'Freeze',
  blackout: 'Blackout',
  preset: 'Preset abrufen'
}
