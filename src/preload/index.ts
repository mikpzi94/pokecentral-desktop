import { contextBridge, ipcRenderer } from 'electron'
import type {
  CollectionCapability,
  DesktopApi,
  GameControl,
  GameSlot,
  GameViewPlacement,
  GameViewStatus,
  ImportedFile,
  InventorySnapshot,
  HuntSession,
  MarketSnapshot
} from '../shared/types'

const api: DesktopApi = {
  selectImportFile: (): Promise<ImportedFile | null> => ipcRenderer.invoke('imports:select-file'),
  getCollectionCapability: (): Promise<CollectionCapability> => ipcRenderer.invoke('collection:capability'),
  showGameLayout: (placements: GameViewPlacement[]): Promise<GameViewStatus[]> =>
    ipcRenderer.invoke('launcher:show-layout', placements),
  updateGameLayout: (placements: GameViewPlacement[]): Promise<void> =>
    ipcRenderer.invoke('launcher:update-layout', placements),
  hideGameLayout: (): Promise<void> => ipcRenderer.invoke('launcher:hide-layout'),
  controlGameAccount: (slot: GameSlot, action: GameControl): Promise<void> =>
    ipcRenderer.invoke('launcher:control', slot, action),
  removeGameAccount: (slot: GameSlot, clearSession: boolean): Promise<void> =>
    ipcRenderer.invoke('launcher:remove-account', slot, clearSession),
  getInventorySnapshot: (slot: GameSlot): Promise<InventorySnapshot | null> =>
    ipcRenderer.invoke('launcher:inventory', slot),
  getMarketSnapshot: (slot: GameSlot): Promise<MarketSnapshot | null> => ipcRenderer.invoke('launcher:market', slot),
  copyShareCard: (payload: { text: string; imageDataUrl?: string }): Promise<void> =>
    ipcRenderer.invoke('share:copy-card', payload),
  openShareUrl: (url: string): Promise<void> => ipcRenderer.invoke('share:open-url', url),
  onGameStatus: (listener: (status: GameViewStatus) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: GameViewStatus): void => listener(status)
    ipcRenderer.on('launcher:status', handler)
    return () => ipcRenderer.removeListener('launcher:status', handler)
  },
  onInventorySnapshot: (listener: (snapshot: InventorySnapshot) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: InventorySnapshot): void => listener(snapshot)
    ipcRenderer.on('launcher:inventory-updated', handler)
    return () => ipcRenderer.removeListener('launcher:inventory-updated', handler)
  },
  onMarketSnapshot: (listener: (snapshot: MarketSnapshot) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: MarketSnapshot): void => listener(snapshot)
    ipcRenderer.on('launcher:market-updated', handler)
    return () => ipcRenderer.removeListener('launcher:market-updated', handler)
  },
  onHuntSession: (listener: (session: HuntSession) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, session: HuntSession): void => listener(session)
    ipcRenderer.on('launcher:hunt-updated', handler)
    return () => ipcRenderer.removeListener('launcher:hunt-updated', handler)
  }
}

contextBridge.exposeInMainWorld('pokecentral', Object.freeze(api))
