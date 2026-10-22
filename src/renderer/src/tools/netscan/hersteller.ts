// Suchbegriff für die Manuals-Bibliothek aus dem Hersteller der MAC-Datenbank: „Xi'an NovaStar
// Tech Co., Ltd.“ → „NovaStar“. Rechtsformen, Branchenwörter und häufige Städte vorne fallen weg –
// ein Wort genügt der Suche, den Rest kann man dort ergänzen.

const FUELL = new Set([
  'co',
  'corp',
  'corporation',
  'company',
  'inc',
  'incorporated',
  'ltd',
  'limited',
  'llc',
  'gmbh',
  'ag',
  'kg',
  'bv',
  'sa',
  'srl',
  'spa',
  'oy',
  'ab',
  'as',
  'pte',
  'pty',
  'plc',
  'sas',
  'sarl',
  'technology',
  'technologies',
  'tech',
  'electronics',
  'electronic',
  'international',
  'group',
  'holdings',
  'holding',
  'industrial',
  'industries',
  'systems',
  'the',
  "xi'an",
  'xian',
  'shenzhen',
  'guangzhou',
  'beijing',
  'shanghai',
  'hangzhou',
  'zhejiang',
  'dongguan',
  'suzhou',
  'wuhan',
  'chengdu',
  'nanjing',
  'xiamen',
  'zhuhai',
  'foshan'
])

export function herstellerSuchbegriff(vendor: string): string {
  const woerter = vendor
    .replace(/[,.()/]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const kern = woerter.find((w) => !FUELL.has(w.toLowerCase()) && w.length > 1)
  return (kern ?? woerter[0] ?? '').slice(0, 40)
}
