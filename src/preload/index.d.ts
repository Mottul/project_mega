import type { ToolboxApi } from '@shared/ipc-contracts'

declare global {
  interface Window {
    api: ToolboxApi
  }
}

export {}
