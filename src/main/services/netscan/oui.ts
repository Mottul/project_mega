// Kleine, kuratierte MAC-OUI -> Hersteller-Tabelle. BEWUSST klein gehalten und
// nur mit gut belegten Präfixen – lieber „unbekannt" als falsch. Unbekannte
// OUIs zeigt die Oberfläche als Rohwert (erste drei Oktette) an, damit man sie
// selbst nachschlagen kann. Bei Bedarf einfach ergänzen.

const OUI: Record<string, string> = {
  // Blackmagic Design (ATEM, Videohub, …)
  '7c:2e:0d': 'Blackmagic Design',
  // Raspberry Pi (häufig als Player/Controller im Einsatz)
  'b8:27:eb': 'Raspberry Pi',
  'dc:a6:32': 'Raspberry Pi',
  'e4:5f:01': 'Raspberry Pi',
  '28:cd:c1': 'Raspberry Pi',
  // Axis Communications (Netzwerkkameras)
  '00:40:8c': 'Axis Communications',
  'ac:cc:8e': 'Axis Communications',
  // Ubiquiti (Netzwerk/APs)
  '24:a4:3c': 'Ubiquiti',
  '78:8a:20': 'Ubiquiti',
  'fc:ec:da': 'Ubiquiti',
  // Dell
  '00:14:22': 'Dell',
  'b8:ca:3a': 'Dell',
  // TP-Link
  '50:c7:bf': 'TP-Link',
  '14:cc:20': 'TP-Link',
  // AVM (FRITZ!Box)
  '3c:a6:2f': 'AVM',
  '38:10:d5': 'AVM'
}

/** Hersteller zur MAC (best effort). Unbekannt -> null. */
export function vendorFor(mac: string | null): string | null {
  if (!mac) return null
  return OUI[mac.slice(0, 8)] ?? null
}
