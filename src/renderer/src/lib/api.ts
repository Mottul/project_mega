import type { ToolboxApi } from '@shared/ipc-contracts'

// Typisierter Zugriff auf die per preload exponierte Bruecke.
export const api: ToolboxApi = window.api
