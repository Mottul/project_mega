// TCP-Ports, die abgetastet werden, plus die Logik, aus den offenen Ports (und
// Bonjour-Diensten, ATEM-Flag, Hersteller) einen Gerätetyp zu raten.

import type { NetDeviceType, NetService } from '@shared/types'

// Abgetastete TCP-Ports. Bewusst kompakt (typische AV-/Netzwerkdienste), damit
// der Scan zügig bleibt. ATEM (UDP 9910) wird separat per UDP-Handshake geprüft.
export const PROBE_PORTS = [
  22, // SSH
  23, // Telnet
  80, // HTTP
  443, // HTTPS
  445, // SMB
  554, // RTSP (Kameras/Streams)
  1935, // RTMP
  3389, // RDP
  4352, // PJLink (Projektoren)
  5200, // NovaStar (LED-Prozessoren)
  5900, // VNC
  7000, // AirPlay
  8000, // ONVIF/HTTP-alt (Kameras)
  8080, // HTTP-alt
  8443 // HTTPS-alt
]

export const PORT_LABEL: Record<number, string> = {
  22: 'SSH',
  23: 'Telnet',
  80: 'HTTP',
  443: 'HTTPS',
  445: 'SMB',
  554: 'RTSP',
  1935: 'RTMP',
  3389: 'RDP',
  4352: 'PJLink',
  5200: 'NovaStar',
  5900: 'VNC',
  7000: 'AirPlay',
  8000: 'ONVIF',
  8080: 'HTTP',
  8443: 'HTTPS',
  9910: 'ATEM'
}

const CAMERA_VENDOR =
  /axis|sony|panasonic|canon|bosch|hikvision|dahua|ptzoptics|birddog|lumens|marshall|vaddio/

/** Gerätetyp aus den gesammelten Merkmalen raten. Reihenfolge = Spezifität. */
export function classify(d: {
  ports: number[]
  vendor: string | null
  services: Pick<NetService, 'type'>[]
  atem?: boolean
}): NetDeviceType {
  const has = (p: number): boolean => d.ports.includes(p)
  const v = (d.vendor ?? '').toLowerCase()
  const svc = d.services.map((s) => s.type).join(' ')

  if (d.atem || v.includes('blackmagic')) return 'atem'
  if (has(5200)) return 'novastar'
  if (has(4352)) return 'projector'
  if (
    has(554) ||
    svc.includes('_rtsp') ||
    (has(8000) && has(80)) ||
    (CAMERA_VENDOR.test(v) && has(80))
  )
    return 'camera'
  if (has(1935)) return 'video'
  if (svc.includes('_ipp') || svc.includes('_printer') || svc.includes('_pdl-datastream'))
    return 'printer'
  if (has(3389) || has(445) || has(5900) || svc.includes('_smb') || svc.includes('_workstation'))
    return 'computer'
  if (has(80) || has(443) || has(8080) || has(8443) || svc.includes('_http')) return 'web'
  return 'unknown'
}
