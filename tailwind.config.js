/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  // Die Rechner-PWA hat eigene Quellen (vite.pwa.config.ts, src/pwa/build/sources.ts)
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semantische Tokens (CSS-Variablen in assets/main.css), shadcn-aehnlich
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        card: 'hsl(var(--card) / <alpha-value>)',
        muted: 'hsl(var(--muted) / <alpha-value>)',
        'muted-foreground': 'hsl(var(--muted-foreground) / <alpha-value>)',
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        primary: 'hsl(var(--primary) / <alpha-value>)',
        'primary-foreground': 'hsl(var(--primary-foreground) / <alpha-value>)',
        accent: 'hsl(var(--accent) / <alpha-value>)',
        'accent-foreground': 'hsl(var(--accent-foreground) / <alpha-value>)',
        // Rot als volle Fläche (Knöpfe, „Live“); Fehlertext, -rahmen und -tönung: danger
        destructive: 'hsl(var(--destructive) / <alpha-value>)',
        'destructive-foreground': 'hsl(var(--destructive-foreground) / <alpha-value>)',
        // Status: Erfolg, Warnung/Auftrag, Fehler – je Theme in assets/main.css
        success: 'hsl(var(--success) / <alpha-value>)',
        warning: 'hsl(var(--warning) / <alpha-value>)',
        'warning-foreground': 'hsl(var(--warning-foreground) / <alpha-value>)',
        danger: 'hsl(var(--danger) / <alpha-value>)'
      },
      borderRadius: {
        lg: '0.625rem',
        md: '0.5rem',
        sm: '0.375rem'
      }
    }
  },
  plugins: [
    // `light:`-Variante (Hell-Theme = Klasse .light am <html>) für Farben ohne Token
    // (Datenfarben wie konvex/konkav, Hintergründe von Wellenform und PDF-Ansicht).
    function ({ addVariant }) {
      addVariant('light', '.light &')
    }
  ]
}
