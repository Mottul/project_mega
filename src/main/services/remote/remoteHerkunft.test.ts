import { describe, expect, it } from 'vitest'
import { eigenerName, pruefeHerkunft } from './remoteHerkunft'

const RECHNER = 'Regie-PC'
const urteil = (host?: string, origin?: string): string => pruefeHerkunft({ host, origin }, RECHNER)

describe('eigenerName – unter welchen Namen ist der Rechner im eigenen Netz erreichbar?', () => {
  it('IP-Adressen (QR-Code), localhost, einfache Namen und Bonjour', () => {
    for (const name of [
      '192.168.1.10',
      '10.0.0.7',
      '169.254.213.138',
      '::1',
      'fe80::1',
      'localhost',
      'timer.localhost',
      'regie-pc',
      'andererpc',
      'macbook-von-anna.local'
    ]) {
      expect(eigenerName(name, RECHNER), name).toBe(true)
    }
  })

  it('der eigene Rechnername mit jeder Endung von Router oder Firmennetz', () => {
    expect(eigenerName('regie-pc.fritz.box', RECHNER)).toBe(true)
    expect(eigenerName('regie-pc.firma.de', RECHNER)).toBe(true)
    // macOS nennt sich selbst mit .local
    expect(eigenerName('matthias-mbp.fritz.box', 'Matthias-MBP.local')).toBe(true)
  })

  it('Namen aus dem Internet nie – auch nicht mit dem Rechnernamen mittendrin', () => {
    for (const name of ['boese.example', 'www.boese.example', 'boese.regie-pc.example', 'x.box']) {
      expect(eigenerName(name, RECHNER), name).toBe(false)
    }
    // ohne Rechnernamen passt kein Name mit Punkt
    expect(eigenerName('.boese.example', '')).toBe(false)
  })
})

describe('pruefeHerkunft – darf diese Anfrage steuern?', () => {
  it('Programme ohne Browser (Companion, curl) und alte Geräte ohne Host-Kopf', () => {
    expect(urteil()).toBe('ok')
    expect(urteil('192.168.1.10:8088')).toBe('ok')
    expect(urteil('[::1]:8092')).toBe('ok')
    expect(urteil('regie-pc:8090')).toBe('ok')
  })

  it('die eigene Steuerseite: Origin und Host sind dieselbe Adresse', () => {
    expect(urteil('192.168.1.10:8088', 'http://192.168.1.10:8088')).toBe('ok')
    expect(urteil('Regie-PC.fritz.box:8090', 'http://regie-pc.fritz.box:8090')).toBe('ok')
    // Standardport: weder Browser noch Host-Kopf nennen ihn
    expect(urteil('192.168.1.10', 'http://192.168.1.10')).toBe('ok')
    expect(urteil('[fe80::1]:8090', 'http://[fe80::1]:8090')).toBe('ok')
    // Großschreibung und Punkt am Ende ändern die Adresse nicht
    expect(urteil('regie-pc.local.:8090', 'HTTP://REGIE-PC.LOCAL.:8090')).toBe('ok')
  })

  it('fremde Website: anderer Name, anderer Port, abgeschotteter Rahmen', () => {
    expect(urteil('192.168.1.10:8088', 'http://boese.example')).toBe('fremde-seite')
    expect(urteil('192.168.1.10:8088', 'https://boese.example:8088')).toBe('fremde-seite')
    // auch eine andere Fernsteuerung desselben Rechners ist eine andere Herkunft
    expect(urteil('192.168.1.10:8088', 'http://192.168.1.10:8090')).toBe('fremde-seite')
    expect(urteil('192.168.1.10:8088', 'null')).toBe('fremde-seite')
    expect(urteil('192.168.1.10:8088', 'chrome-extension://abcdef')).toBe('fremde-seite')
    expect(urteil('192.168.1.10:8088', '')).toBe('fremde-seite')
    // Origin ohne Host lässt sich nicht vergleichen
    expect(urteil(undefined, 'http://192.168.1.10:8088')).toBe('fremde-seite')
  })

  it('fremder Name, der auf den Rechner zeigt (DNS-Rebinding) – auch wenn Origin dazu passt', () => {
    expect(urteil('boese.example:8088')).toBe('fremder-name')
    expect(urteil('boese.example:8088', 'http://boese.example:8088')).toBe('fremder-name')
    expect(urteil('anderer-pc.fritz.box:8088')).toBe('fremder-name')
  })

  it('unlesbarer oder getarnter Host-Kopf', () => {
    for (const host of ['', 'bö se', 'boese.example@192.168.1.10', '192.168.1.10/pfad', 'a b:80']) {
      expect(urteil(host), JSON.stringify(host)).toBe('fremder-name')
    }
  })
})
