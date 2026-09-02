import { audio } from './core/audio'
import { Input, MAX_PLAYERS } from './core/input'
import { DEFAULT_BINDING, type PadBinding, type PadBindings } from './core/gamepad'
import { clamp } from './core/math'
import { BATTLE_ARENAS, RACE_TRACKS, type TrackDef } from './game/tracks'
import { DRIVERS } from './game/drivers'
import { World, type Mode } from './game/world'
import { buildResultRows, type ResultRow } from './game/results'
import { drawHud, drawOverlays, drawPause, drawStandings, text } from './render/hud'
import type { Viewport } from './render/mode7'
import { createChaseCamera, SceneRenderer, updateChaseCamera, type ChaseCamera } from './render/scene'
import { buildKartSprites, kartFrameIndex } from './render/sprites'
import { Menu, type MenuPage } from './ui/menu'
import { TouchControls, type Pointer } from './ui/touch'
import { drawTrackPreview } from './ui/preview'
import { generateTrack, randomSeed, trackName } from './game/procedural'

type Screen = 'title' | 'menu' | 'playing' | 'paused' | 'results' | 'padlearn'

/** Reihenfolge, in der die Pad-Tasten angelernt werden. */
const LEARN_STEPS: { key: keyof PadBinding; label: string }[] = [
  { key: 'accel', label: 'GAS' },
  { key: 'brake', label: 'BREMSE' },
  { key: 'drift', label: 'DRIFT' },
  { key: 'item', label: 'ITEM' },
]

interface Settings {
  players: number
  mode: Mode
  trackIndex: number
  arenaIndex: number
  drivers: string[]
  difficulty: number
  laps: number
  cpu: number
  muted: boolean
  /** Zufallsstrecke statt einer festen Strecke fahren. */
  randomTrack: boolean
  /** Seed der Zufallsstrecke - dieselbe Zahl ergibt dieselbe Strecke. */
  seed: number
  /** Angelernte Tastenbelegung je Gamepad-Modell. */
  padBindings: PadBindings
}

const SETTINGS_KEY = 'super-kart:settings'
const BASE_HEIGHT = 240
const DIFFICULTY_NAMES = ['LEICHT', 'NORMAL', 'SCHWER']
const PLAYER_HINTS = [
  'Einzelspieler gegen die KI',
  'Splitscreen: P1 oben, P2 unten',
  'Viererraster - das freie Feld zeigt die Rangliste',
  'Viererraster: P1 P2 oben, P3 P4 unten',
]

function loadSettings(): Settings {
  const fallback: Settings = {
    players: 1,
    mode: 'race',
    trackIndex: 0,
    arenaIndex: 0,
    drivers: ['rosso', 'blu', 'verde', 'ocra'],
    difficulty: 1,
    laps: 3,
    cpu: 5,
    muted: false,
    randomTrack: false,
    seed: 1234,
    padBindings: {},
  }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return fallback
    const stored = { ...fallback, ...(JSON.parse(raw) as Partial<Settings>) }
    // Ältere Stände kannten nur zwei Fahrer - Lücken auffüllen.
    stored.drivers = fallback.drivers.map((d, i) => stored.drivers[i] ?? d)
    stored.players = clamp(stored.players, 1, MAX_PLAYERS)
    return stored
  } catch {
    return fallback
  }
}

function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // Privater Modus o. ä. - Einstellungen sind dann eben flüchtig.
  }
}

export class Game {
  private display: HTMLCanvasElement
  private displayCtx: CanvasRenderingContext2D
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private width = 428
  private height = BASE_HEIGHT

  private input = new Input()
  private scene: SceneRenderer
  private menu = new Menu()
  private touch = new TouchControls()
  private pointers = new Map<number, Pointer>()

  private settings = loadSettings()
  private screen: Screen = 'title'
  private world: World | null = null
  private cameras: ChaseCamera[] = []
  private pauseIndex = 0
  private time = 0
  private lastFrame = 0
  private previewSprites = new Map<string, HTMLCanvasElement[]>()
  private installPrompt: { prompt: () => void } | null = null
  private results: ResultRow[] = []
  private generated: { key: string; def: TrackDef } | null = null
  private learnStep = 0
  private learnPad: string | null = null
  private learnDraft: PadBinding = { ...DEFAULT_BINDING }

  constructor(display: HTMLCanvasElement) {
    this.display = display
    this.displayCtx = display.getContext('2d', { alpha: false })!
    this.canvas = document.createElement('canvas')
    this.canvas.width = this.width
    this.canvas.height = this.height
    this.ctx = this.canvas.getContext('2d', { alpha: false })!
    this.scene = new SceneRenderer(this.width, this.height)

    for (const d of DRIVERS) this.previewSprites.set(d.id, buildKartSprites(d.body, d.accent, d.skin).frames)

    this.input.gamepads.bindings = this.settings.padBindings
    this.input.attach()
    this.bindPointer()
    this.bindInstallPrompt()
    window.addEventListener('resize', () => this.resize())
    this.resize()
    this.menu.reset(this.buildMainMenu())
    audio.setMuted(this.settings.muted)
  }

  start(): void {
    this.lastFrame = performance.now()
    requestAnimationFrame(this.frame)
  }

  // ------------------------------------------------------------ Einrichtung

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const cssW = window.innerWidth
    const cssH = window.innerHeight
    this.display.width = Math.round(cssW * dpr)
    this.display.height = Math.round(cssH * dpr)
    this.display.style.width = `${cssW}px`
    this.display.style.height = `${cssH}px`

    // Interne Auflösung: feste Höhe, Breite nach Seitenverhältnis. Der grobe
    // Pixelraster ist Absicht - er macht den 16-Bit-Look und hält die
    // Mode-7-Schleife auch auf Telefonen flüssig.
    const aspect = cssW / Math.max(1, cssH)
    this.height = BASE_HEIGHT
    this.width = clamp(Math.round(BASE_HEIGHT * aspect), 240, 620)
    if (this.canvas.width !== this.width || this.canvas.height !== this.height) {
      this.canvas.width = this.width
      this.canvas.height = this.height
      this.scene.resize(this.width, this.height)
    }
    this.touch.layout(this.viewports())
  }

  private bindPointer(): void {
    const toInternal = (e: PointerEvent): Pointer => {
      const rect = this.display.getBoundingClientRect()
      return {
        x: ((e.clientX - rect.left) / rect.width) * this.width,
        y: ((e.clientY - rect.top) / rect.height) * this.height,
      }
    }
    this.display.addEventListener('pointerdown', (e) => {
      this.display.setPointerCapture(e.pointerId)
      const p = toInternal(e)
      this.pointers.set(e.pointerId, p)
      if (e.pointerType === 'touch') {
        this.input.usedTouch = true
        this.touch.visible = true
      }
      audio.unlock()
      this.onTap(p)
    })
    this.display.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return
      this.pointers.set(e.pointerId, toInternal(e))
    })
    const release = (e: PointerEvent) => this.pointers.delete(e.pointerId)
    this.display.addEventListener('pointerup', release)
    this.display.addEventListener('pointercancel', release)
    this.display.addEventListener('contextmenu', (e) => e.preventDefault())
    window.addEventListener('keydown', () => audio.unlock(), { once: true })
  }

  private bindInstallPrompt(): void {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()
      this.installPrompt = e as unknown as { prompt: () => void }
    })
  }

  private onTap(p: Pointer): void {
    if (this.screen === 'title') {
      this.screen = 'menu'
      return
    }
    if (this.screen === 'menu' || this.screen === 'results') {
      this.menu.tap(p.x, p.y)
      return
    }
    if (this.screen === 'playing' && p.y < 22 && p.x > this.width - 40) {
      this.togglePause()
    }
  }

  // ------------------------------------------------------------- Ansichten

  private activePlayers(): number {
    if (this.screen === 'playing' || this.screen === 'paused') return this.world?.players.length ?? 1
    return this.settings.players
  }

  /**
   * Bildaufteilung: einer bekommt alles, zwei teilen sich waagerecht, drei und
   * vier fahren im Viererraster. Bei drei Spielern bleibt ein Feld frei - dort
   * steht die Rangliste.
   */
  private layout(): { views: Viewport[]; spare: Viewport | null } {
    const players = this.activePlayers()
    const W = this.width
    const H = this.height
    if (players < 2) return { views: [{ x: 0, y: 0, w: W, h: H }], spare: null }
    if (players === 2) {
      const half = Math.floor(H / 2)
      return {
        views: [
          { x: 0, y: 0, w: W, h: half },
          { x: 0, y: half, w: W, h: H - half },
        ],
        spare: null,
      }
    }
    const hw = Math.floor(W / 2)
    const hh = Math.floor(H / 2)
    const quads: Viewport[] = [
      { x: 0, y: 0, w: hw, h: hh },
      { x: hw, y: 0, w: W - hw, h: hh },
      { x: 0, y: hh, w: hw, h: H - hh },
      { x: hw, y: hh, w: W - hw, h: H - hh },
    ]
    return { views: quads.slice(0, players), spare: players === 3 ? quads[3]! : null }
  }

  private viewports(): Viewport[] {
    return this.layout().views
  }

  // ------------------------------------------------------------------ Menüs

  private buildMainMenu(): MenuPage {
    return {
      title: 'SUPER KART',
      subtitle: () => 'Mode-7-Rennspiel · Rennen & Battle',
      items: [
        {
          label: 'SPIELER',
          value: () => `${this.settings.players}`,
          onLeft: () => this.setPlayers(this.settings.players - 1),
          onRight: () => this.setPlayers(this.settings.players + 1),
          onSelect: () => this.setPlayers((this.settings.players % MAX_PLAYERS) + 1),
          hint: () => PLAYER_HINTS[this.settings.players - 1] ?? '',
        },
        {
          label: 'MODUS',
          value: () => (this.settings.mode === 'race' ? 'RENNEN' : 'BATTLE'),
          onLeft: () => this.setMode('race'),
          onRight: () => this.setMode('battle'),
          onSelect: () => this.setMode(this.settings.mode === 'race' ? 'battle' : 'race'),
          hint: () =>
            this.settings.mode === 'race'
              ? 'Rundenrennen gegen Item-bewaffnete Gegner'
              : 'Ballonschlacht - wer zuletzt Ballons hat, gewinnt',
        },
        { label: 'FAHRER WÄHLEN', onSelect: () => this.menu.push(this.buildDriverPage(0)) },
        { label: 'STRECKE WÄHLEN', onSelect: () => this.menu.push(this.buildTrackPage()) },
        { label: 'RENNEN STARTEN', onSelect: () => this.startMatch() },
        { label: 'EINSTELLUNGEN', onSelect: () => this.menu.push(this.buildOptionsPage()) },
        { label: 'STEUERUNG', onSelect: () => this.menu.push(this.buildControlsPage()) },
        {
          label: 'CONTROLLER',
          onSelect: () => this.menu.push(this.buildPadPage()),
          hint: () => `${this.input.gamepads.count()} Gamepad(s) erkannt`,
        },
      ],
    }
  }

  private setPlayers(n: number): void {
    this.settings.players = clamp(n, 1, MAX_PLAYERS)
    // Doppelte Fahrer wären im Splitscreen nicht auseinanderzuhalten.
    this.ensureUniqueDrivers()
    saveSettings(this.settings)
    this.touch.layout(this.viewports())
  }

  private setMode(mode: Mode): void {
    this.settings.mode = mode
    saveSettings(this.settings)
  }

  /** Fahrer, die bereits ein anderer Spieler belegt. */
  private takenDrivers(except: number): Set<string> {
    const taken = new Set<string>()
    for (let i = 0; i < this.settings.players; i++) {
      if (i !== except) taken.add(this.settings.drivers[i]!)
    }
    return taken
  }

  private ensureUniqueDrivers(): void {
    for (let i = 0; i < this.settings.players; i++) {
      const taken = this.takenDrivers(i)
      if (!taken.has(this.settings.drivers[i]!)) continue
      const free = DRIVERS.find((d) => !taken.has(d.id))
      if (free) this.settings.drivers[i] = free.id
    }
    saveSettings(this.settings)
  }

  private buildDriverPage(player: number): MenuPage {
    const pick = (dir: number) => {
      const taken = this.takenDrivers(player)
      let cur = DRIVERS.findIndex((d) => d.id === this.settings.drivers[player])
      // Belegte Fahrer überspringen - jeder Spieler soll erkennbar bleiben.
      for (let step = 0; step < DRIVERS.length; step++) {
        cur = (cur + dir + DRIVERS.length) % DRIVERS.length
        if (!taken.has(DRIVERS[cur]!.id)) break
      }
      this.settings.drivers[player] = DRIVERS[cur]!.id
      saveSettings(this.settings)
    }
    const hasNext = player + 1 < this.settings.players
    return {
      title: `FAHRER · SPIELER ${player + 1}`,
      subtitle: () => DRIVERS.find((x) => x.id === this.settings.drivers[player])!.name,
      items: [
        {
          label: 'FAHRER',
          value: () => DRIVERS.find((d) => d.id === this.settings.drivers[player])!.name,
          onLeft: () => pick(-1),
          onRight: () => pick(1),
          onSelect: () => pick(1),
        },
        {
          label: hasNext ? `WEITER ZU SPIELER ${player + 2}` : 'ZURÜCK',
          onSelect: () => {
            if (hasNext) this.menu.push(this.buildDriverPage(player + 1))
            else this.menu.pop()
          },
        },
      ],
      render: (ctx, w, h, _i, time) => this.drawDriverPreview(ctx, w, h, player, time),
    }
  }

  private drawDriverPreview(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    player: number,
    time: number
  ): void {
    const driver = DRIVERS.find((d) => d.id === this.settings.drivers[player])!
    const frames = this.previewSprites.get(driver.id)
    if (frames) {
      const frame = frames[kartFrameIndex(time * 1.6)]!
      const size = Math.min(h * 0.34, w * 0.3)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(frame, w / 2 - size / 2, h * 0.6, size, size)
    }
    const bars: [string, number][] = [
      ['TEMPO', driver.topSpeed],
      ['BESCHL.', driver.acceleration],
      ['HANDLING', driver.handling],
      ['GEWICHT', driver.weight],
    ]
    const bx = w / 2 + Math.min(w * 0.2, 110)
    bars.forEach(([label, value], i) => {
      const y = h * 0.62 + i * 12
      text(ctx, label, bx, y, 8, 'rgba(255,255,255,0.7)')
      const filled = clamp((value - 0.8) / 0.5, 0.05, 1)
      ctx.fillStyle = 'rgba(255,255,255,0.18)'
      ctx.fillRect(bx + 44, y + 1, 48, 6)
      ctx.fillStyle = driver.accent
      ctx.fillRect(bx + 44, y + 1, 48 * filled, 6)
    })
  }

  private currentTrackList(): TrackDef[] {
    return this.settings.mode === 'race' ? RACE_TRACKS : BATTLE_ARENAS
  }

  /**
   * Die Zufallsstrecke wird gepuffert: Die Vorschau zeichnet jeden Frame, und
   * das Erzeugen samt Prüfung kostet ein paar Millisekunden.
   */
  private generatedTrack(): TrackDef {
    const key = `${this.settings.mode}:${this.settings.seed}`
    if (!this.generated || this.generated.key !== key) {
      this.generated = { key, def: generateTrack(this.settings.mode, this.settings.seed) }
    }
    return this.generated.def
  }

  private currentTrack(): TrackDef {
    if (this.settings.randomTrack) return this.generatedTrack()
    const list = this.currentTrackList()
    const idx = this.settings.mode === 'race' ? this.settings.trackIndex : this.settings.arenaIndex
    return list[idx % list.length]!
  }

  private buildTrackPage(): MenuPage {
    // Die Zufallsstrecke hängt als zusätzlicher Eintrag hinter der Liste.
    const move = (dir: number) => {
      const list = this.currentTrackList()
      const total = list.length + 1
      const current = this.settings.randomTrack
        ? list.length
        : this.settings.mode === 'race'
          ? this.settings.trackIndex
          : this.settings.arenaIndex
      const next = (current + dir + total) % total
      this.settings.randomTrack = next === list.length
      if (!this.settings.randomTrack) {
        if (this.settings.mode === 'race') this.settings.trackIndex = next
        else this.settings.arenaIndex = next
      }
      saveSettings(this.settings)
    }
    const setSeed = (value: number) => {
      this.settings.seed = ((value % 1000000) + 1000000) % 1000000
      this.settings.randomTrack = true
      saveSettings(this.settings)
    }
    return {
      title: 'STRECKE',
      subtitle: () =>
        this.settings.randomTrack ? `Zufall · ${this.currentTrack().name}` : this.currentTrack().name,
      items: [
        {
          label: 'STRECKE',
          value: () => (this.settings.randomTrack ? 'ZUFALL' : this.currentTrack().name),
          onLeft: () => move(-1),
          onRight: () => move(1),
          onSelect: () => move(1),
          hint: () => 'Hinter der Liste liegt die Zufallsstrecke',
        },
        {
          label: 'SEED',
          value: () => String(this.settings.seed),
          onLeft: () => setSeed(this.settings.seed - 1),
          onRight: () => setSeed(this.settings.seed + 1),
          onSelect: () => setSeed(randomSeed()),
          hint: () => 'Gleicher Seed = gleiche Strecke. Auswählen würfelt neu.',
        },
        {
          label: 'NEU WÜRFELN',
          onSelect: () => setSeed(randomSeed()),
          hint: () =>
            this.settings.randomTrack ? trackName(this.settings.seed) : 'Schaltet auf Zufallsstrecke um',
        },
        { label: 'STARTEN', onSelect: () => this.startMatch() },
        { label: 'ZURÜCK', onSelect: () => this.menu.pop() },
      ],
      render: (ctx, w, h) => {
        const size = Math.min(h * 0.33, w * 0.3)
        drawTrackPreview(ctx, this.currentTrack(), w / 2 - size / 2, h * 0.6, size)
      },
    }
  }

  // ------------------------------------------------------------- Controller

  private buildPadPage(): MenuPage {
    return {
      title: 'CONTROLLER',
      subtitle: () => `${this.input.gamepads.count()} Gamepad(s) erkannt`,
      items: [
        {
          label: 'BELEGUNG ANLERNEN',
          onSelect: () => this.startPadLearning(),
          hint: () => 'Für USB-Pads, deren Tasten nicht zum Standard passen',
        },
        {
          label: 'BELEGUNG ZURÜCKSETZEN',
          onSelect: () => {
            this.settings.padBindings = {}
            this.input.gamepads.bindings = this.settings.padBindings
            saveSettings(this.settings)
          },
        },
        ...[0, 1, 2].map((i) => ({
          label: `PLÄTZE TAUSCHEN P${i + 1} ↔ P${i + 2}`,
          onSelect: () => this.input.gamepads.swap(i, i + 1),
        })),
        { label: 'ZURÜCK', onSelect: () => this.menu.pop() },
      ],
      render: (ctx, w, h) => this.drawPadList(ctx, w, h),
    }
  }

  /** Live-Anzeige der erkannten Pads - zeigt sofort, ob ein Pad ankommt. */
  private drawPadList(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const pads = this.input.gamepads.list()
    const top = h * 0.62
    if (pads.length === 0) {
      text(ctx, 'Kein Gamepad erkannt.', w / 2, top, 9, 'rgba(255,255,255,0.7)', 'center')
      text(ctx, 'Anstecken und eine Taste drücken.', w / 2, top + 12, 9, 'rgba(255,255,255,0.5)', 'center')
      return
    }
    pads.forEach(({ player, state }, i) => {
      const y = top + i * 13
      const active = state.pressedCount > 0 || Math.abs(state.steer) > 0.2
      text(ctx, `P${player + 1}`, w * 0.5 - 150, y, 9, active ? '#ffe14a' : 'rgba(255,255,255,0.8)')
      text(ctx, state.id || 'Gamepad', w * 0.5 - 126, y, 9, 'rgba(255,255,255,0.8)')
      // Lenkbalken als Sofortkontrolle für die Achse.
      const bx = w * 0.5 + 30
      ctx.fillStyle = 'rgba(255,255,255,0.16)'
      ctx.fillRect(bx, y + 2, 56, 5)
      ctx.fillStyle = '#7fd4ff'
      ctx.fillRect(bx + 28, y + 2, state.steer * 28, 5)
      text(
        ctx,
        state.standard ? 'Standard' : 'anlernen',
        w * 0.5 + 150,
        y,
        8,
        state.standard ? 'rgba(140,255,180,0.8)' : 'rgba(255,190,120,0.9)',
        'right'
      )
    })
  }

  private startPadLearning(): void {
    this.learnStep = 0
    this.learnPad = null
    this.learnDraft = { ...DEFAULT_BINDING }
    this.screen = 'padlearn'
  }

  /** Nimmt die nächste gedrückte Taste als Belegung für den aktuellen Schritt. */
  private updatePadLearning(): void {
    if (this.input.wasPressed('Escape')) {
      this.screen = 'menu'
      return
    }
    const hit = this.input.gamepads.anyJustPressed()
    if (!hit) return
    // Das erste Pad, das reagiert, ist das Pad, das angelernt wird.
    if (this.learnPad === null) this.learnPad = hit.state.id
    else if (hit.state.id !== this.learnPad) return

    const step = LEARN_STEPS[this.learnStep]
    if (!step) return
    this.learnDraft[step.key] = hit.button
    audio.sfx('confirm')
    this.learnStep++

    if (this.learnStep >= LEARN_STEPS.length) {
      this.settings.padBindings = { ...this.settings.padBindings, [this.learnPad]: { ...this.learnDraft } }
      this.input.gamepads.bindings = this.settings.padBindings
      saveSettings(this.settings)
      this.screen = 'menu'
    }
  }

  private drawPadLearning(ctx: CanvasRenderingContext2D): void {
    const w = this.width
    const h = this.height
    ctx.fillStyle = 'rgba(6,8,18,0.8)'
    ctx.fillRect(0, 0, w, h)
    text(ctx, 'BELEGUNG ANLERNEN', w / 2, h * 0.22, 18, '#ffe14a', 'center')
    const step = LEARN_STEPS[this.learnStep]
    text(ctx, step ? `Taste für ${step.label} drücken` : 'Fertig', w / 2, h * 0.45, 14, '#ffffff', 'center')
    text(
      ctx,
      this.learnPad ? this.learnPad : 'Beliebiges Pad drücken - es wird angelernt',
      w / 2,
      h * 0.45 + 22,
      9,
      'rgba(255,255,255,0.7)',
      'center'
    )
    LEARN_STEPS.forEach((entry, i) => {
      const done = i < this.learnStep
      text(
        ctx,
        `${entry.label}${done ? ` = Taste ${this.learnDraft[entry.key]}` : ''}`,
        w / 2,
        h * 0.62 + i * 12,
        9,
        done ? 'rgba(140,255,180,0.9)' : 'rgba(255,255,255,0.45)',
        'center'
      )
    })
    text(ctx, 'ESC bricht ab', w / 2, h - 20, 9, 'rgba(255,255,255,0.5)', 'center')
  }

  private buildOptionsPage(): MenuPage {
    const items: MenuPage['items'] = [
      {
        label: 'RUNDEN',
        value: () => `${this.settings.laps}`,
        onLeft: () => this.adjust('laps', -1, 1, 7),
        onRight: () => this.adjust('laps', 1, 1, 7),
        onSelect: () => this.adjust('laps', 1, 1, 7),
      },
      {
        label: 'GEGNER',
        value: () => `${Math.min(this.settings.cpu, this.maxCpu())}`,
        onLeft: () => this.adjust('cpu', -1, 0, this.maxCpu()),
        onRight: () => this.adjust('cpu', 1, 0, this.maxCpu()),
        onSelect: () => this.adjust('cpu', 1, 0, this.maxCpu()),
        hint: () => `Höchstens ${this.maxCpu()} bei ${this.settings.players} Spieler(n)`,
      },
      {
        label: 'SCHWIERIGKEIT',
        value: () => DIFFICULTY_NAMES[this.settings.difficulty]!,
        onLeft: () => this.adjust('difficulty', -1, 0, 2),
        onRight: () => this.adjust('difficulty', 1, 0, 2),
        onSelect: () => this.adjust('difficulty', 1, 0, 2),
      },
      {
        label: 'TON',
        value: () => (this.settings.muted ? 'AUS' : 'AN'),
        onSelect: () => {
          this.settings.muted = !this.settings.muted
          audio.setMuted(this.settings.muted)
          saveSettings(this.settings)
        },
        onLeft: () => {
          this.settings.muted = true
          audio.setMuted(true)
          saveSettings(this.settings)
        },
        onRight: () => {
          this.settings.muted = false
          audio.setMuted(false)
          saveSettings(this.settings)
        },
      },
      { label: 'ZURÜCK', onSelect: () => this.menu.pop() },
    ]
    if (this.installPrompt) {
      items.splice(items.length - 1, 0, {
        label: 'APP INSTALLIEREN',
        onSelect: () => this.installPrompt?.prompt(),
        hint: () => 'Fügt das Spiel zum Startbildschirm hinzu',
      })
    }
    return { title: 'EINSTELLUNGEN', items }
  }

  /** Es gibt genau acht Fahrer - die Spieler belegen davon schon welche. */
  private maxCpu(): number {
    return Math.max(0, DRIVERS.length - this.settings.players)
  }

  private adjust(key: 'laps' | 'cpu' | 'difficulty', dir: number, lo: number, hi: number): void {
    this.settings[key] = clamp(this.settings[key] + dir, lo, hi)
    saveSettings(this.settings)
  }

  private buildControlsPage(): MenuPage {
    return {
      title: 'STEUERUNG',
      items: [{ label: 'ZURÜCK', onSelect: () => this.menu.pop() }],
      render: (ctx, w, h) => {
        const lines = [
          'SPIELER 1 · Pfeiltasten · Leertaste Drift · Enter Item',
          'SPIELER 2 · W A S D · Shift links Drift · E Item',
          'SPIELER 3 · I J K L · U Drift · O Item',
          'SPIELER 4 · Ziffernblock 8 4 5 6 · 7 Drift · 9 Item',
          'GAMEPAD  · Stick/Steuerkreuz, A Gas, B Bremse,',
          '           L/R Drift, X Item - Pad 1..4 = Spieler 1..4',
          'TOUCH    · Lenkfeld links, Tasten rechts',
          'ESC      · Pause',
        ]
        lines.forEach((line, i) => {
          text(ctx, line, w * 0.5, h * 0.38 + i * 13, 9, 'rgba(255,255,255,0.85)', 'center')
        })
      },
    }
  }

  // ------------------------------------------------------------- Spielstart

  private startMatch(): void {
    const trackDef = this.currentTrack()
    this.ensureUniqueDrivers()
    const drivers = this.settings.drivers.slice(0, this.settings.players)
    const maxCpu = Math.min(this.settings.cpu, DRIVERS.length - drivers.length)
    this.world = new World({
      mode: this.settings.mode,
      trackDef,
      playerDrivers: drivers,
      cpuCount: this.settings.mode === 'battle' ? Math.max(1, maxCpu) : maxCpu,
      laps: this.settings.laps,
      difficulty: this.settings.difficulty,
    })
    this.cameras = this.world.players.map((k) => createChaseCamera(k))
    this.screen = 'playing'
    this.touch.layout(this.viewports())
    audio.unlock()
    audio.startMusic(trackDef.music)
    // Flanken vorbereiten, damit eine noch gedrückte Taste kein Item auslöst.
    this.input.state(0)
    this.input.state(1)
  }

  private togglePause(): void {
    if (this.screen === 'playing') {
      this.screen = 'paused'
      this.pauseIndex = 0
      this.world?.cancelDrifts()
      audio.stopEngines()
      audio.sfx('back')
    } else if (this.screen === 'paused') {
      this.screen = 'playing'
      audio.sfx('confirm')
    }
  }

  private finishMatch(): void {
    const world = this.world
    if (!world) return
    audio.stopMusic()
    audio.stopEngines()
    audio.sfx('finish')

    this.results = buildResultRows(world.mode, world.karts, world.laps)

    this.screen = 'results'
    this.menu.reset({
      title: world.mode === 'race' ? 'ZIEL' : 'BATTLE VORBEI',
      items: [
        { label: 'NOCHMAL', onSelect: () => this.startMatch() },
        {
          label: 'STRECKE WECHSELN',
          onSelect: () => {
            this.screen = 'menu'
            this.menu.reset(this.buildMainMenu())
            this.menu.push(this.buildTrackPage())
          },
        },
        {
          label: 'HAUPTMENÜ',
          onSelect: () => {
            this.screen = 'menu'
            this.world = null
            this.menu.reset(this.buildMainMenu())
          },
        },
      ],
      render: (ctx, w, h) => {
        const top = h * 0.5
        this.results.slice(0, 8).forEach((row, i) => {
          const y = top + i * 12
          text(
            ctx,
            `${row.place}. ${row.name}`,
            w * 0.5 - 110,
            y,
            9,
            row.highlight ? '#ffe14a' : 'rgba(255,255,255,0.8)'
          )
          text(ctx, row.detail, w * 0.5 + 110, y, 9, 'rgba(255,255,255,0.65)', 'right')
        })
      },
    })
  }

  // ---------------------------------------------------------------- Schleife

  private frame = (now: number): void => {
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000)
    this.lastFrame = now
    this.time += dt

    this.input.beginFrame()
    this.touch.apply(this.pointers.values(), this.input)
    this.update(dt)
    this.render()

    requestAnimationFrame(this.frame)
  }

  private update(dt: number): void {
    const menuInput = this.input.menu()

    if (this.screen === 'title') {
      if (menuInput.any) {
        audio.unlock()
        this.screen = 'menu'
      }
      return
    }

    if (this.screen === 'padlearn') {
      this.updatePadLearning()
      return
    }

    if (this.screen === 'menu' || this.screen === 'results') {
      this.menu.update(menuInput)
      return
    }

    if (this.screen === 'paused') {
      const entries = ['WEITER', 'NEUSTART', 'HAUPTMENÜ']
      if (menuInput.up) {
        this.pauseIndex = (this.pauseIndex + entries.length - 1) % entries.length
        audio.sfx('menu')
      }
      if (menuInput.down) {
        this.pauseIndex = (this.pauseIndex + 1) % entries.length
        audio.sfx('menu')
      }
      if (menuInput.confirm) {
        if (this.pauseIndex === 0) this.togglePause()
        else if (this.pauseIndex === 1) this.startMatch()
        else {
          this.screen = 'menu'
          this.world = null
          audio.stopMusic()
          this.menu.reset(this.buildMainMenu())
        }
        audio.sfx('confirm')
      }
      if (menuInput.back) this.togglePause()
      return
    }

    // --- laufendes Spiel
    if (this.input.wasPressed('Escape') || this.input.wasPressed('KeyP')) this.togglePause()

    const world = this.world
    if (!world) return

    const controls = world.players.map((_, i) => this.input.state(i))
    // In Teilschritten simulieren, damit hohe Geschwindigkeiten keine Wände
    // überspringen und die Physik bei Rucklern stabil bleibt.
    let remaining = dt
    while (remaining > 0) {
      const step = Math.min(remaining, 1 / 90)
      world.update(step, controls)
      remaining -= step
    }

    audio.engineCount = world.players.length
    world.players.forEach((kart, i) => {
      const cam = this.cameras[i]
      if (cam) updateChaseCamera(cam, kart, dt)
      audio.engine(i, world.speedRatio(kart), world.state !== 'over')
    })

    this.playEvents(world)

    if (world.state === 'over') this.finishMatch()
  }

  private playEvents(world: World): void {
    for (const ev of world.events) {
      if (ev.kart === undefined) {
        audio.sfx(ev.kind === 'countdown' ? 'countdown' : 'go')
        continue
      }
      const kart = world.karts[ev.kart]
      if (!kart) continue
      // Nur Ereignisse in Hörweite eines Spielers vertonen.
      const near = world.players.some((p) => (p.x - kart.x) ** 2 + (p.y - kart.y) ** 2 < 1400 ** 2)
      if (!near) continue
      switch (ev.kind) {
        case 'itemBox':
          audio.sfx('itemBox')
          break
        case 'itemRoll':
          audio.sfx('itemRoll')
          break
        case 'boost':
          audio.sfx('boost')
          break
        case 'shoot':
          audio.sfx('shoot')
          break
        case 'drop':
          audio.sfx('drop')
          break
        case 'hit':
          audio.sfx('hit')
          if (kart.player >= 0) this.input.gamepads.rumble(kart.player, 0.8, 260)
          break
        case 'pop':
          audio.sfx('pop')
          if (kart.player >= 0) this.input.gamepads.rumble(kart.player, 0.4, 140)
          break
        case 'lap':
          audio.sfx('lap')
          break
        case 'finish':
          audio.sfx('finish')
          break
        default:
          break
      }
    }
  }

  // ----------------------------------------------------------------- Ausgabe

  private render(): void {
    const ctx = this.ctx
    ctx.imageSmoothingEnabled = false

    if (this.screen === 'playing' || this.screen === 'paused') this.renderGame(ctx)
    else this.renderMenuBackdrop(ctx)

    if (this.screen === 'title') this.renderTitle(ctx)
    else if (this.screen === 'padlearn') this.drawPadLearning(ctx)
    else if (this.screen === 'menu' || this.screen === 'results')
      this.menu.draw(ctx, this.width, this.height, this.time)
    else if (this.screen === 'paused')
      drawPause(ctx, this.width, this.height, this.pauseIndex, ['WEITER', 'NEUSTART', 'HAUPTMENÜ'])

    if (this.touch.visible && (this.screen === 'playing' || this.screen === 'paused')) this.touch.draw(ctx)

    // Hochskalieren auf die Anzeige - harte Pixel, kein Weichzeichnen.
    const d = this.displayCtx
    d.imageSmoothingEnabled = false
    d.fillStyle = '#05060c'
    d.fillRect(0, 0, this.display.width, this.display.height)
    d.drawImage(this.canvas, 0, 0, this.display.width, this.display.height)
  }

  private renderGame(ctx: CanvasRenderingContext2D): void {
    const world = this.world
    if (!world) return
    const { views, spare } = this.layout()

    views.forEach((view, i) => {
      const cam = this.cameras[i]
      if (cam) this.scene.renderGround(view, cam, world)
    })
    ctx.putImageData(this.scene.mode7.buffer, 0, 0)

    views.forEach((view, i) => {
      const cam = this.cameras[i]
      const kart = world.players[i]
      if (!cam || !kart) return
      this.scene.renderObjects(ctx, view, cam, world, this.time)
      drawHud(ctx, view, world, kart, `P${i + 1}`, views.length > 1)
    })

    if (spare) drawStandings(ctx, spare, world)
    this.drawSplitBorders(ctx, views)
    drawOverlays(ctx, world, views)
  }

  /** Trennlinien zwischen den Splitscreen-Feldern. */
  private drawSplitBorders(ctx: CanvasRenderingContext2D, views: Viewport[]): void {
    if (views.length < 2) return
    ctx.fillStyle = '#05060c'
    const half = views[0]!.h
    ctx.fillRect(0, half - 1, this.width, 2)
    if (views.length > 2) ctx.fillRect(views[0]!.w - 1, 0, 2, this.height)
  }

  /** Hintergrund für Titel und Menü: eine ruhige Kamerafahrt über die Strecke. */
  private renderMenuBackdrop(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#0a0c18'
    ctx.fillRect(0, 0, this.width, this.height)
    const stripes = 26
    for (let i = 0; i < stripes; i++) {
      const t = (i / stripes + this.time * 0.05) % 1
      const y = this.height * 0.45 + t * t * this.height * 0.75
      ctx.fillStyle = i % 2 === 0 ? 'rgba(60,40,120,0.5)' : 'rgba(30,20,70,0.5)'
      ctx.fillRect(0, y, this.width, Math.max(1, t * 12))
    }
    ctx.fillStyle = 'rgba(10,8,26,0.55)'
    ctx.fillRect(0, 0, this.width, this.height * 0.45)
  }

  private renderTitle(ctx: CanvasRenderingContext2D): void {
    text(ctx, 'SUPER KART', this.width / 2, this.height * 0.28, 34, '#ffe14a', 'center')
    text(
      ctx,
      'Mode-7-Rennspiel für jede Plattform',
      this.width / 2,
      this.height * 0.28 + 40,
      10,
      'rgba(255,255,255,0.8)',
      'center'
    )
    if (Math.floor(this.time * 1.6) % 2 === 0) {
      text(ctx, 'TASTE ODER BILDSCHIRM BERÜHREN', this.width / 2, this.height * 0.68, 11, '#ffffff', 'center')
    }
  }
}
