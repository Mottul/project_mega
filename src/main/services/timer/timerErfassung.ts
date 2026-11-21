// Offscreen-Erfassung des Stage-Timers: EIN unsichtbares Fenster mit der Timer-Anzeige
// (#/timer-output) für NDI und den Stream fürs Heimnetz – laufen beide, malt es nur einmal.

import { OffscreenErfassung } from '../erfassung/offscreenErfassung'

export const timerErfassung = new OffscreenErfassung('[timer-erfassung]', {
  route: () => '/timer-output'
})
