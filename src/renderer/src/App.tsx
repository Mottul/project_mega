import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ToolHost } from './launcher/ToolHost'
import { PlayerOutput } from './tools/video-player/PlayerOutput'

// stoffl-Branch: die App IST der LED-Trailer-Player -- kein Startbildschirm,
// die Wurzel springt direkt ins Tool (Registry enthält nur dieses eine).
export function App(): JSX.Element {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/tool/video-player" replace />} />
        <Route path="/tool/:id" element={<ToolHost />} />
        {/* rahmenloses Vollbild-Ausgabefenster des Video-Players */}
        <Route path="/player-output" element={<PlayerOutput />} />
      </Routes>
    </HashRouter>
  )
}
