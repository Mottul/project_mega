import { lazy } from 'react'
import { Radar } from 'lucide-react'
import type { ToolModule } from '../types'

export const netscanTool: ToolModule = {
  id: 'netscan',
  name: 'Netzwerk-Scanner',
  description: 'Geräte im Netz finden: IP, Hersteller, Typ',
  icon: Radar,
  category: 'control',
  keywords: [
    'netzwerk',
    'network',
    'scanner',
    'scan',
    'ip',
    'geräte',
    'devices',
    'discovery',
    'lan',
    'subnet',
    'arp',
    'bonjour',
    'mdns',
    'atem',
    'ptz',
    'kamera',
    'camera',
    'novastar',
    'onvif',
    'rtsp',
    'led-prozessoren',
    'video-mischer',
    'ptz-kameras',
    'projektoren'
  ],
  component: lazy(() => import('./NetScan').then((m) => ({ default: m.NetScan })))
}
