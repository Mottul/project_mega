// Platzhalter-Logo: eine Box mit großem „M". Bewusst schlicht, bis ein finales
// Logo feststeht. Farben über Props überschreibbar (für Vorschau/Varianten).

export function MottulboxLogo({
  size = 40,
  box = '#7c4dff',
  letter = '#ffffff',
  radius = 18,
  className
}: {
  size?: number
  box?: string
  letter?: string
  radius?: number
  className?: string
}): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Mottulbox"
    >
      <rect x="6" y="6" width="88" height="88" rx={radius} fill={box} />
      <path
        d="M30 72 L30 30 L50 53 L70 30 L70 72"
        fill="none"
        stroke={letter}
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
