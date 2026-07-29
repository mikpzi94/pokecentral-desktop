import type { DesktopApi } from '../../shared/types'

declare global {
  interface Window {
    pokecentral: DesktopApi
  }
}

export {}
