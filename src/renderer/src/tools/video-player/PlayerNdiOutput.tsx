// Inhalt des unsichtbaren NDI-Spiegelfensters (#/player-ndi): ein PASSIVER
// Spiegel der Wiedergabe (treibt nicht, meldet nichts) in der vom main-Prozess
// gewählten Fenstergröße. Query-Parameter steuern Darstellung und Ton:
//   fit=fill|contain  (1:1 formatfüllend bzw. in die Auflösung eingebettet)
//   audio=1           (WebAudio-Tap -> PCM an den NDI-Sender im main)
import { useSearchParams } from 'react-router-dom'
import { PlaybackEngine } from './PlaybackEngine'

export function PlayerNdiOutput(): JSX.Element {
  const [params] = useSearchParams()
  const fit = params.get('fit') === 'contain' ? 'contain' : 'fill'
  const audio = params.get('audio') === '1'
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <PlaybackEngine objectFit={fit} passive audioTap={audio} />
    </div>
  )
}
