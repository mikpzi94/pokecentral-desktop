export const accountStatuses = ['disconnected', 'ready', 'attention'] as const
export type AccountStatus = (typeof accountStatuses)[number]
export type GameSlot = 1 | 2 | 3 | 4

export type Account = {
  id: string
  name: string
  characterName?: string
  slot: GameSlot
  status: AccountStatus
  lastSync?: string
}

export type PokemonStats = {
  hp: number
  attack: number
  defense: number
  specialAttack: number
  specialDefense: number
  speed: number
}

export type Pokemon = {
  id: string
  accountId: string
  speciesId?: number
  species: string
  level?: number
  quality?: string
  iv?: number
  shiny: boolean
  power?: number
  stats?: PokemonStats
  notes?: string
  source: 'file' | 'screenshot' | 'assisted'
  sourceName?: string
  importedAt: string
}

export type LocalListing = {
  id: string
  pokemonId: string
  accountId: string
  pokemon: Pokemon
  price: number
  negotiable: boolean
  publicCode?: string
  status?: 'active' | 'auto-removed' | 'sold'
  removedAt?: string
  createdAt: string
  updatedAt: string
  priceUpdatedAt?: string
  priceReviewDismissedAt?: string
}

export type SellerProfile = {
  whatsapp: string
  discordUsername: string
  discordUserId: string
  preferredContact: 'whatsapp' | 'discord'
}

export type InventoryCategory = 'ball' | 'item'

export type InventoryItem = {
  id: string
  accountId: string
  itemId?: number
  name: string
  quantity: number
  category: InventoryCategory
  gameCategory?: string
  icon?: string
  npcPrice?: number
  importedAt: string
}

export type ImportedFile = {
  name: string
  kind: 'json' | 'csv' | 'image'
  mimeType: string
  content: string
}

export type CollectionCapability = {
  available: boolean
  reason: string
}

export type GameViewBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type GameViewPlacement = {
  slot: GameSlot
  bounds: GameViewBounds
  zoomFactor?: number
  persistSession?: boolean
}

export type GameViewStatus = {
  slot: GameSlot
  state: 'idle' | 'loading' | 'ready' | 'stalled' | 'error'
  url?: string
  message?: string
  characterName?: string
}

export type GameControl = 'home' | 'reload' | 'back' | 'forward' | 'eco-on' | 'eco-off' | 'sleep-on' | 'sleep-off'

export type InventoryPokemon = {
  id: string
  speciesId?: number
  species: string
  level?: number
  quality?: number
  ivTotal?: number
  shiny: boolean
  power?: number
  stats?: PokemonStats
}

export type InventoryGameItem = {
  id: string
  itemId?: number
  name: string
  quantity: number
  category: InventoryCategory
  gameCategory?: string
  icon?: string
  npcPrice?: number
}

export type InventorySnapshot = {
  slot: GameSlot
  characterName?: string
  pokemon: InventoryPokemon[]
  items: InventoryGameItem[]
  pokemonUpdated?: boolean
  itemsUpdated?: boolean
  capturedAt: string
  source: 'game-session'
}

export type MarketListing = {
  id: string
  slot: GameSlot
  side: 'sale' | 'request'
  name: string
  category: string
  currency: string
  price: number
  quantity: number
  seller?: string
  itemId?: number
  npcPrice?: number
  level?: number
  iv?: number
  quality?: number
  shiny?: boolean
  capturedAt: string
}

export type MarketSnapshot = { slot: GameSlot; listings: MarketListing[]; capturedAt: string; source: 'game-session' }


export type HuntSession = {
  id: string
  slot: GameSlot
  huntName: string
  pokemonName?: string
  startedAt: string
  updatedAt: string
  endedAt?: string
  lastKillAt?: string
  lastActivityAt?: string
  kills: number
  xp: number
  gold: number
  lootValue?: number
  captureValue?: number
  supplyCost?: number
  captureAttempts?: number
  shinyEncounters?: number
  shinyCaptured?: number
  shinyEscaped?: number
  observedDurationMs?: number
  captures: number
  shinies: number
  estimateAtStart?: {
    xpPerHour: number
    lootPerHour: number
    killsPerHour: number
    generatedAt: string
    confidence: 'measured' | 'calibrated' | 'theoretical'
  }
  dataQuality?: 'complete' | 'partial'
  identityConfidence?: 'confirmed' | 'ambiguous' | 'legacy'
  identitySource?: 'game-event' | 'active-card'
  source: 'game-session'
}
export type DesktopApi = {
  selectImportFile: () => Promise<ImportedFile | null>
  getCollectionCapability: () => Promise<CollectionCapability>
  showGameLayout: (placements: GameViewPlacement[]) => Promise<GameViewStatus[]>
  updateGameLayout: (placements: GameViewPlacement[]) => Promise<void>
  hideGameLayout: () => Promise<void>
  controlGameAccount: (slot: GameSlot, action: GameControl) => Promise<void>
  removeGameAccount: (slot: GameSlot, clearSession: boolean) => Promise<void>
  getInventorySnapshot: (slot: GameSlot) => Promise<InventorySnapshot | null>
  getMarketSnapshot: (slot: GameSlot) => Promise<MarketSnapshot | null>
  copyShareCard: (payload: { text: string; imageDataUrl?: string }) => Promise<void>
  openShareUrl: (url: string) => Promise<void>
  onGameStatus: (listener: (status: GameViewStatus) => void) => () => void
  onInventorySnapshot: (listener: (snapshot: InventorySnapshot) => void) => () => void
  onMarketSnapshot: (listener: (snapshot: MarketSnapshot) => void) => () => void
  onHuntSession: (listener: (session: HuntSession) => void) => () => void
}
