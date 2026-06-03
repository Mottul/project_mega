import { HashRouter, Route, Routes } from 'react-router-dom'
import { Launcher } from './launcher/Launcher'
import { ToolHost } from './launcher/ToolHost'
import { OutputView } from './tools/test-patterns/OutputView'

export function App(): JSX.Element {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Launcher />} />
        <Route path="/tool/:id" element={<ToolHost />} />
        {/* rahmenloses Vollbild-Ausgabefenster des Testbildgenerators */}
        <Route path="/output" element={<OutputView />} />
      </Routes>
    </HashRouter>
  )
}
