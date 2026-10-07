// Video-Player: Playlist löschen nur nach Rückfrage (auch mit „anderem Fenster“), parallele
// Importe, dieselbe Quelle zweimal, gleichnamige Kopien aus verschiedenen Ordnern.
// Aus den Cloud-Läufen vom 7. Oktober 2026 übernommen. Die Importe brauchen das gebündelte
// ffmpeg (`npm run ff:fetch`); ohne es werden sie übersprungen.
//
// Stolpersteine, die hier schon gelöst sind:
// - Der Einstellungs-Broadcast erreicht das Fenster nicht, das die Änderung selbst auslöst.
//   „Ein anderes Fenster speichert“ heißt deshalb: wirklich ein zweites Fenster öffnen.
// - Dieselbe Route noch einmal zu setzen lädt nichts neu. Für frische Einstellungen erst
//   speichern, dann zu `/` und zurück navigieren.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  findFfmpeg,
  holdConfirm,
  launchApp,
  openRoute,
  resolveConfirm,
  runSteps,
  Skip,
  sleep,
  stubConfirmSequence,
  waitFor
} from './harness.mjs'

const ctx = await launchApp()
const { app, page: w } = ctx
const ffmpeg = findFfmpeg()
const clipsDir = mkdtempSync(join(tmpdir(), 'mottulbox-e2e-clips-'))

const settings = () => w.evaluate(() => window.api.getSettings())
const savedPlaylists = async () => (await settings()).player.savedPlaylists.map((p) => p.name)
const wall = { width: 1280, height: 720 }
const finished = (l) => l.every((j) => ['done', 'error'].includes(j.status))
const convertList = () => w.evaluate(() => window.api.player.convertList())

/** Zeigt den Player frisch (erst `/`, dann zurück), damit er die Einstellungen neu liest. */
async function reopenPlayer() {
  await openRoute(w, '/')
  await sleep(300)
  await openRoute(w, '/tool/video-player')
}

function makeClip(name, seconds = 6, tone = 400) {
  if (!ffmpeg) throw new Skip('ffmpeg fehlt (npm run ff:fetch)')
  const file = join(clipsDir, name)
  execFileSync(ffmpeg, [
    ...['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=s=1280x720:r=25:d=${seconds}`],
    ...['-f', 'lavfi', '-i', `sine=f=${tone}:d=${seconds}`],
    ...['-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', file]
  ])
  return file
}

/** Importiert und wartet, bis alle Aufträge fertig sind; liefert Liste und höchste Parallelität. */
async function importAndWait(sources, expectedJobs, fitMode = 'bars') {
  await w.evaluate(() => window.api.player.convertClearFinished())
  await w.evaluate((a) => window.api.player.import(a), { sources, fitMode, wall })
  let maxConv = 0
  const list = await waitFor(
    async () => {
      const l = await convertList()
      maxConv = Math.max(
        maxConv,
        l.filter((j) => ['converting', 'probing'].includes(j.status)).length
      )
      return l.length === expectedJobs && finished(l) ? l : null
    },
    120_000,
    100
  )
  assert.ok(list, 'Importe nicht rechtzeitig fertig')
  return { list, maxConv }
}

try {
  await w.getByText('Video-Player').first().waitFor({ timeout: 30_000 })

  await runSteps('Video-Player', [
    [
      'Playlist löschen: Abbrechen behält, Bestätigen löscht',
      async () => {
        await w.evaluate(() =>
          window.api.setSettings({ player: { savedPlaylists: [{ name: 'Show A', mediaIds: [] }] } })
        )
        await reopenPlayer()
        await w.getByText('Show A').first().waitFor({ timeout: 15_000 })
        assert.equal(await w.getByText('Gleichzeitige Importe', { exact: true }).count(), 1)
        assert.equal((await settings()).player.importConcurrency, 2, 'Standard: 2 parallel')
        await stubConfirmSequence(app, [1, 0])
        const del = w.getByRole('button', { name: 'Playlist „Show A“ löschen' })
        await del.click()
        await sleep(600)
        assert.deepEqual(await savedPlaylists(), ['Show A'])
        await del.click()
        await sleep(600)
        assert.deepEqual(await savedPlaylists(), [])
      }
    ],
    [
      'Playlist löschen: Stand nach der Rückfrage ist frisch (zweites Fenster speichert währenddessen)',
      async () => {
        await w.evaluate(() =>
          window.api.setSettings({ player: { savedPlaylists: [{ name: 'Akt 1', mediaIds: [] }] } })
        )
        await reopenPlayer()
        await w.getByText('Akt 1').first().waitFor({ timeout: 15_000 })
        await holdConfirm(app)
        await w.getByRole('button', { name: 'Playlist „Akt 1“ löschen' }).click()
        await sleep(400)
        // zweites Fenster, dessen Speichern an das erste gemeldet wird
        const opened = app.waitForEvent('window')
        await w.evaluate(() => window.api.openToolWindow('video-player'))
        const w2 = await opened
        await w2.waitForLoadState('domcontentloaded')
        await w2.evaluate(() =>
          window.api.setSettings({
            player: {
              savedPlaylists: [
                { name: 'Akt 1', mediaIds: [] },
                { name: 'Akt 2', mediaIds: [] }
              ]
            }
          })
        )
        await w.getByText('Akt 2').first().waitFor({ timeout: 15_000 })
        await resolveConfirm(app, true)
        await sleep(600)
        assert.deepEqual(await savedPlaylists(), ['Akt 2'])
        await w2.close()
      }
    ],
    [
      'drei Importe: höchstens zwei gleichzeitig (Vorgabe)',
      async () => {
        const clips = [1, 2, 3].map((i) => makeClip(`p${i}.mp4`, 6, 300 + i * 100))
        await reopenPlayer()
        const { list, maxConv } = await importAndWait(clips, 3)
        assert.ok(
          list.every((j) => j.status === 'done'),
          JSON.stringify(list.map((j) => [j.status, j.error]))
        )
        assert.equal(maxConv, 2)
      }
    ],
    [
      'dieselbe Quelle zweimal: beide fertig, ein Medium, ein Bibliothekseintrag',
      async () => {
        const twin = join(clipsDir, 'twin.mp4')
        copyFileSync(join(clipsDir, 'p1.mp4'), twin)
        await w.evaluate(() => window.api.player.convertClearFinished())
        await w.evaluate(
          (a) => {
            window.api.player.import(a)
            window.api.player.import(a)
          },
          { sources: [twin], fitMode: 'blur', wall }
        )
        const list = await waitFor(async () => {
          const l = await convertList()
          return l.length === 2 && finished(l) ? l : null
        }, 120_000)
        assert.ok(list, 'nicht rechtzeitig fertig')
        assert.ok(
          list.every((j) => j.status === 'done'),
          JSON.stringify(list.map((j) => [j.status, j.error]))
        )
        assert.equal(list[0].mediaId, list[1].mediaId)
        const lib = await w.evaluate(() => window.api.player.libraryList())
        assert.equal(lib.filter((x) => x.sourcePath === twin).length, 1)
      }
    ],
    [
      'gleichnamige Kopien aus zwei Ordnern: keine Fehler, eine Fassung, keine verwaisten Dateien',
      async () => {
        const src = makeClip('dup-src.mp4', 8)
        const when = new Date('2026-01-01T10:00:00Z')
        const copies = ['Tag1', 'Tag2'].map((d) => {
          const dir = join(clipsDir, 'show', d)
          mkdirSync(dir, { recursive: true })
          const f = join(dir, 'Opener.mp4')
          copyFileSync(src, f)
          utimesSync(f, when, when) // Explorer/Finder behalten die Änderungszeit beim Kopieren
          return f
        })
        const other = join(clipsDir, 'show', 'Tag1', 'Anderes.mp4')
        copyFileSync(src, other)
        const { list, maxConv } = await importAndWait([...copies, other], 3)
        assert.ok(
          list.every((j) => j.status === 'done'),
          JSON.stringify(list.map((j) => [j.title, j.status, j.error]))
        )
        assert.equal(maxConv, 2, 'die andere Datei soll an den Kopien vorbeiziehen')
        const lib = await w.evaluate(() => window.api.player.libraryList())
        assert.equal(lib.filter((x) => x.originalName === 'Opener.mp4').length, 1)
        const files = readdirSync(join(ctx.userData, 'player-media')).filter((f) =>
          f.endsWith('.mp4')
        )
        assert.equal(files.length, lib.length, `${files.length} Dateien, ${lib.length} Einträge`)
      }
    ]
  ])
} finally {
  await ctx.close()
  rmSync(clipsDir, { recursive: true, force: true })
}
