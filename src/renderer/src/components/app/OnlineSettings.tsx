// Online-Ablage im App-Menü: ein Ordner, den ein Cloud-Dienst im Netz veröffentlicht (pCloud
// Public Folder über pCloud Drive), und seine Web-Adresse. Das Mini-Manual schreibt die
// Handy-Fassung dorthin (je Anleitung ein Unterordner) und druckt die Adresse als QR-Code auf die
// Kurzkarte. Hochladen tut der Dienst – ein Zugang zu ihm steht nie in der App.

import { FolderOpen } from 'lucide-react'
import { DEFAULT_ONLINE_SETTINGS } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { TextField } from '@renderer/components/ui/text-field'
import { api } from '@renderer/lib/api'
import { updateSettings, useSettings } from '@renderer/lib/settings'

/** Adresse des Ordners: https, ohne Abfrage (main prüft dasselbe beim Schreiben) */
export const onlineAdresseOk = (url: string): boolean => /^https:\/\/[^\s?#]+$/.test(url.trim())

export function OnlineSettings(): JSX.Element {
  const online = useSettings((s) => s.online) ?? DEFAULT_ONLINE_SETTINGS

  async function choose(): Promise<void> {
    const paths = await api.selectPaths({
      title: 'Ordner der Online-Ablage wählen (z. B. pCloud Public Folder)',
      directories: true
    })
    if (paths[0]) updateSettings({ online: { dir: paths[0] } })
  }

  return (
    <div className="space-y-2 text-sm">
      <p className="break-all" data-testid="online-ordner">
        {online.dir || <span className="text-muted-foreground">nicht eingerichtet</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void choose()}>
          Ordner wählen …
        </Button>
        {online.dir && (
          <Button variant="outline" size="sm" onClick={() => void api.showItemInFolder(online.dir)}>
            <FolderOpen className="size-4" />
            Im Ordner zeigen
          </Button>
        )}
        {(online.dir || online.url) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => updateSettings({ online: { dir: '', url: '' } })}
          >
            Entfernen
          </Button>
        )}
      </div>
      <TextField
        aria-label="Adresse der Online-Ablage"
        placeholder="https://filedn.eu/…/"
        value={online.url}
        maxLength={300}
        onCommit={(url) => updateSettings({ online: { url: url.trim() } })}
      />
      {online.url && !onlineAdresseOk(online.url) && (
        <p className="text-xs text-danger">Die Adresse muss mit https:// beginnen (ohne „?…“).</p>
      )}
      <p className="text-xs text-muted-foreground">
        pCloud: den „Public Folder“ in pCloud Drive wählen und als Adresse den Anfang eines Links
        daraus bis zum Ordner, z. B. https://filedn.eu/…/ – je Anleitung kommt ein Unterordner dazu.
      </p>
    </div>
  )
}
