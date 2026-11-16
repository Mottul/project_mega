// Rechenkern des Kreisrechners: aus EINEM Maß – dem zuletzt bearbeiteten Feld – die übrigen drei.
// Getrennt von der Oberfläche, damit er sich ohne Fenster prüfen lässt; die Komponente liest nur
// den Text und zeigt die Zahlen an.

/** Die vier verknüpften Felder: Durchmesser, Radius, Umfang, Fläche. */
export type CircleField = 'd' | 'r' | 'c' | 'a'

const TAU = Math.PI * 2

/**
 * Alle vier Maße aus dem bearbeiteten Feld `field` mit dem Wert `value`. Leer oder negativ: alle
 * `null`. Ohne feste Einheit – Längen in derselben Einheit, die Fläche im Quadrat davon.
 */
export function circleFrom(
  field: CircleField,
  value: number | null
): Record<CircleField, number | null> {
  const r =
    value == null || value < 0
      ? null
      : field === 'd'
        ? value / 2
        : field === 'r'
          ? value
          : field === 'c'
            ? value / TAU
            : Math.sqrt(value / Math.PI) // aus der Fläche
  return {
    d: r == null ? null : r * 2,
    r,
    c: r == null ? null : TAU * r,
    a: r == null ? null : Math.PI * r * r
  }
}
