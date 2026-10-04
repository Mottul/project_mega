# vendor/

Ablage für optionale, nicht über npm verwaltete native Bindings.

- `grandiose/` – NDI-Binding (sende-fähiger Fork `rse/grandiose`) für die NDI-Ausgabe von
  Video-Player und Stage-Timer. Wird NICHT eingecheckt, sondern lokal über `npm run ndi:setup`
  geholt und gegen die Electron-ABI kompiliert (Details: [docs/NDI.md](../docs/NDI.md)).

Der Ordner selbst ist eingecheckt, damit `electron-builder` (extraResources)
immer eine gültige Quelle findet – auch ohne eingerichtetes NDI.
