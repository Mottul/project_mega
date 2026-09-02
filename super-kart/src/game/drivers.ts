/** Fahrerauswahl: Werte sind Multiplikatoren auf die Basiswerte in config.ts. */
export interface Driver {
  id: string
  name: string
  body: string
  accent: string
  skin: string
  topSpeed: number
  acceleration: number
  handling: number
  /** Schwer = schiebt Leichte bei Rempeleien weg. */
  weight: number
}

export const DRIVERS: Driver[] = [
  {
    id: 'rosso',
    name: 'Rosso',
    body: '#e0342f',
    accent: '#ffd24a',
    skin: '#f4d3ae',
    topSpeed: 1.0,
    acceleration: 1.0,
    handling: 1.0,
    weight: 1.0,
  },
  {
    id: 'verde',
    name: 'Verde',
    body: '#2fb14e',
    accent: '#e8f7c8',
    skin: '#f0c79a',
    topSpeed: 0.97,
    acceleration: 1.08,
    handling: 1.06,
    weight: 0.9,
  },
  {
    id: 'blu',
    name: 'Blu',
    body: '#2f6fe0',
    accent: '#a9d8ff',
    skin: '#e6bd94',
    topSpeed: 1.03,
    acceleration: 0.95,
    handling: 0.98,
    weight: 1.05,
  },
  {
    id: 'viola',
    name: 'Viola',
    body: '#8a3fd1',
    accent: '#ffb8f0',
    skin: '#d8a97f',
    topSpeed: 0.99,
    acceleration: 1.04,
    handling: 1.03,
    weight: 0.95,
  },
  {
    id: 'ocra',
    name: 'Ocra',
    body: '#d97a1e',
    accent: '#ffe6a8',
    skin: '#c8926a',
    topSpeed: 1.06,
    acceleration: 0.9,
    handling: 0.93,
    weight: 1.2,
  },
  {
    id: 'nero',
    name: 'Nero',
    body: '#2a2c3a',
    accent: '#9ea6c4',
    skin: '#a9744f',
    topSpeed: 1.08,
    acceleration: 0.88,
    handling: 0.9,
    weight: 1.25,
  },
  {
    id: 'ciano',
    name: 'Ciano',
    body: '#21b9c4',
    accent: '#d6fbff',
    skin: '#f2d2b0',
    topSpeed: 0.95,
    acceleration: 1.12,
    handling: 1.1,
    weight: 0.85,
  },
  {
    id: 'rosa',
    name: 'Rosa',
    body: '#e5559a',
    accent: '#ffe0ef',
    skin: '#f6d7bb',
    topSpeed: 0.96,
    acceleration: 1.1,
    handling: 1.08,
    weight: 0.88,
  },
]

export function driverById(id: string): Driver {
  return DRIVERS.find((d) => d.id === id) ?? DRIVERS[0]!
}
