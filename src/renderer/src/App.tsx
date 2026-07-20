import { HashRouter, Route, Routes } from 'react-router-dom'
import { Launcher } from './launcher/Launcher'
import { ToolHost } from './launcher/ToolHost'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Toaster } from './components/Toaster'
import { TimerOutput } from './tools/stage-timer/TimerOutput'
import { OutputView } from './tools/test-patterns/OutputView'
import { PlayerOutput } from './tools/video-player/PlayerOutput'
import { PlayerNdiOutput } from './tools/video-player/PlayerNdiOutput'
import { OscMonitorWindow } from './tools/osc-control/OscMonitorWindow'

// Toasts nicht in den randlosen Ausgabefenstern zeigen (dürfen nie auf der
// Projektion aufblitzen). Diese Fenster laden feste Routen und wechseln sie nicht.
const isOutputWindow = /^#\/(output|player-output|timer-output|player-ndi)/.test(
  window.location.hash
)

export function App(): JSX.Element {
  return (
    <HashRouter>
      {/* Letzte Auffanglinie: ein Render-Fehler außerhalb eines Tools reißt so
          nicht das ganze Fenster in einen weißen Bildschirm. */}
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Launcher />} />
          <Route path="/tool/:id" element={<ToolHost />} />
          {/* rahmenloses Vollbild-Ausgabefenster des Testbildgenerators */}
          <Route path="/output" element={<OutputView />} />
          {/* rahmenloses Vollbild-Ausgabefenster des Video-Players */}
          <Route path="/player-output" element={<PlayerOutput />} />
          {/* rahmenloses Vollbild-Ausgabefenster des Stage-Timers */}
          <Route path="/timer-output" element={<TimerOutput />} />
          {/* unsichtbares NDI-Spiegelfenster des Video-Players */}
          <Route path="/player-ndi" element={<PlayerNdiOutput />} />
          {/* OSC-Monitor in eigenem Fenster */}
          <Route path="/osc-monitor" element={<OscMonitorWindow />} />
        </Routes>
      </ErrorBoundary>
      {!isOutputWindow && <Toaster />}
    </HashRouter>
  )
}
