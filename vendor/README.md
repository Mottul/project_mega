# vendor/

Ablage für optionale, nicht über npm verwaltete native Bindings.

- `grandiose/` – NDI-Binding (sende-fähiger Fork `rse/grandiose`) für die
  NDI-Ausgabe des Stage-Timers. Wird NICHT eingecheckt, sondern lokal über
  `npm run ndi:setup` geholt und gegen die Electron-ABI kompiliert
  (Details: README, Abschnitt „NDI-Ausgabe").

Der Ordner selbst ist eingecheckt, damit `electron-builder` (extraResources)
immer eine gültige Quelle findet – auch ohne eingerichtetes NDI.
