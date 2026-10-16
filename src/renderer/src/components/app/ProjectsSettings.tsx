// Projektordner im App-Menü: Standard-Speicherort der Projektdateien (.mottul), den mehrere
// Werkzeuge nutzen (LED-Wall, später Anleitung und Packliste). Den aufgelösten Pfad liefert main –
// der Renderer kennt den Dokumente-Ordner nicht.

import { useEffect, useState } from 'react'
import { FolderOpen, RotateCcw } from 'lucide-react'
import type { ProjectsDirInfo } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import { updateSettings, useSettings } from '@renderer/lib/settings'

export function ProjectsSettings(): JSX.Element {
  const dir = useSettings((s) => s.projects.dir)
  const [info, setInfo] = useState<ProjectsDirInfo | null>(null)

  // bei jeder Änderung der Einstellung (auch aus einem anderen Fenster) neu auflösen
  useEffect(() => {
    let alive = true
    void api.projects.dirInfo().then((i) => {
      if (alive) setInfo(i)
    })
    return () => {
      alive = false
    }
  }, [dir])

  async function choose(): Promise<void> {
    const paths = await api.selectPaths({ title: 'Projektordner wählen', directories: true })
    if (paths[0]) updateSettings({ projects: { dir: paths[0] } })
  }

  return (
    <div className="space-y-2 text-sm">
      <p className="break-all" title={info?.path}>
        {info?.path ?? '…'}
      </p>
      <p className="text-xs text-muted-foreground">
        {info?.isDefault ? 'Standard' : 'Eigener Ordner'}
        {info && !info.exists
          ? info.isDefault
            ? ' – wird beim ersten Speichern angelegt'
            : ' – nicht erreichbar, Dialoge starten im Standard'
          : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void choose()}>
          Ändern …
        </Button>
        {info && !info.isDefault && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => updateSettings({ projects: { dir: '' } })}
          >
            <RotateCcw className="size-4" />
            Standard
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={!info?.exists}
          onClick={() => info && void api.showItemInFolder(info.path)}
        >
          <FolderOpen className="size-4" />
          Im Ordner zeigen
        </Button>
      </div>
    </div>
  )
}
