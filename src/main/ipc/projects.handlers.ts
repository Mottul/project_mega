// Projektdateien (.mottul): Projektordner, Öffnen, Ziel für „Speichern unter“, Abschnitt speichern.
// Dünne Hülle um services/projects; geprüft wird dort (Pfade, Abschnitt, Version, Größe).

import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { Channels } from '@shared/ipc-contracts'
import {
  isProjectPath,
  isProjectSectionKey,
  projectFileName,
  PROJECT_EXT
} from '@shared/projectFile'
import type { ProjectSaveRequest } from '@shared/types'
import { showOpenDialog, showSaveDialog } from '../services/fileDialogs'
import {
  inspectTarget,
  openProject,
  peekProject,
  saveSection
} from '../services/projects/projectFiles'
import { ensureProjectsDir, projectsDirInfo } from '../services/projects/projectsDir'
import { getSettings } from '../services/store'
import { handle } from './kanal'

const FILTERS = [{ name: 'Mottulbox-Projekt', extensions: [PROJECT_EXT] }]

export function registerProjectsHandlers(): void {
  handle(Channels.projects.dirInfo, () => projectsDirInfo())

  handle(Channels.projects.open, async (e, section: unknown, path?: unknown) => {
    if (!isProjectSectionKey(section)) return null
    if (path !== undefined) {
      // nur aus „Zuletzt geöffnet“ – kein beliebiger Pfad vom Renderer
      const recent = getSettings().projects.recent
      if (!isProjectPath(path) || !recent.includes(path)) return null
      return openProject(path, section)
    }
    await ensureProjectsDir()
    const res = await showOpenDialog(
      BrowserWindow.fromWebContents(e.sender),
      { title: 'Projektdatei öffnen', properties: ['openFile'], filters: FILTERS },
      'projekte'
    )
    const chosen = res.canceled ? undefined : res.filePaths[0]
    return chosen ? openProject(chosen, section) : null
  })

  handle(
    Channels.projects.chooseTarget,
    async (e, section: unknown, suggestedName: unknown, fresh: unknown) => {
      if (!isProjectSectionKey(section)) return null
      const name = projectFileName(typeof suggestedName === 'string' ? suggestedName : '')
      // Neue Datei: immer im Standard-Projektordner beginnen; sonst im zuletzt benutzten
      const defaultPath = fresh === true ? join(await ensureProjectsDir(), name) : name
      const res = await showSaveDialog(
        BrowserWindow.fromWebContents(e.sender),
        { title: 'Projektdatei speichern', defaultPath, filters: FILTERS },
        'projekte'
      )
      if (res.canceled || !res.filePath) return null
      const path = res.filePath.toLowerCase().endsWith(`.${PROJECT_EXT}`)
        ? res.filePath
        : `${res.filePath}.${PROJECT_EXT}`
      return inspectTarget(path, section)
    }
  )

  handle(Channels.projects.save, (_e, request: ProjectSaveRequest) => saveSection(request))

  // nur lesen (kein Binden): z. B. die LED-Wall-Planung der Datei, an die die Anleitung gebunden ist
  handle(Channels.projects.peek, (_e, section: unknown, path: unknown) => {
    if (!isProjectSectionKey(section) || !isProjectPath(path)) return null
    return peekProject(path, section)
  })
}
