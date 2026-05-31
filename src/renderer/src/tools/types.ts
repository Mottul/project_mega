import type { ComponentType, LazyExoticComponent } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { ToolCategoryId } from '@shared/types'

/** Ein Tool = selbstbeschreibendes Modul. Neues Tool = Ordner + 1 Zeile in registry.ts. */
export interface ToolModule {
  id: string
  name: string
  description: string
  icon: LucideIcon
  category: ToolCategoryId
  keywords?: string[]
  component: LazyExoticComponent<ComponentType>
}

export const CATEGORY_LABELS: Record<ToolCategoryId, string> = {
  media: 'Medien',
  database: 'Datenbank',
  calc: 'Rechner',
  utility: 'Werkzeuge'
}
