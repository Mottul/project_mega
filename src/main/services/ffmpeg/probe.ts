// Schlanke Probe für die HAP-Warteschlange. Läuft über den gemeinsamen
// Medien-Info-Runner: Timeout, lesbare Fehlermeldungen statt „Command failed",
// Cover-Art zählt nicht als Video, Bildrate bei VFR korrekt gemittelt.
export { probeBasic as probe } from './mediaInfo'
