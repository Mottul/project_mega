import { HashRouter, Route, Routes } from 'react-router-dom'
import { Launcher } from './launcher/Launcher'
import { ToolHost } from './launcher/ToolHost'
import { TimerOutput } from './tools/stage-timer/TimerOutput'
import { OutputView } from './tools/test-patterns/OutputView'
import { PlayerOutput } from './tools/video-player/PlayerOutput'

export function App(): JSX.Element {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Launcher />} />
        <Route path="/tool/:id" element={<ToolHost />} />
        {/* rahmenloses Vollbild-Ausgabefenster des Testbildgenerators */}
        <Route path="/output" element={<OutputView />} />
        {/* rahmenloses Vollbild-Ausgabefenster des Video-Players */}
        <Route path="/player-output" element={<PlayerOutput />} />
        {/* rahmenloses Vollbild-Ausgabefenster des Stage-Timers */}
        <Route path="/timer-output" element={<TimerOutput />} />
      </Routes>
    </HashRouter>
  )
}
