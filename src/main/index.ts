import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, safeStorage, session, shell, WebContentsView } from 'electron'
import { extname, join } from 'node:path'
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { getCollectionCapability } from './collection-policy'
import type {
  GameControl,
  GameSlot,
  GameViewBounds,
  GameViewPlacement,
  GameViewStatus,
  ImportedFile,
  InventoryGameItem,
  InventoryPokemon,
  InventorySnapshot,
  HuntSession,
  MarketListing,
  MarketSnapshot,
  PokemonStats
} from '../shared/types'

const STABLE_USER_DATA = join(app.getPath('appData'), 'pokecentral-desktop')
app.setPath('userData', STABLE_USER_DATA)

const MAX_IMPORT_BYTES = 15 * 1024 * 1024
const GAME_HOME_URL = 'https://poke.idleworld.online/login'
const allowedExtensions = new Set(['.json', '.csv', '.png', '.jpg', '.jpeg', '.webp'])
const allowedExternalProtocols = new Set(['https:'])
const allowedShareHosts = new Set(['wa.me', 'api.whatsapp.com', 'web.whatsapp.com', 'discord.com'])
const allowedGameHosts = new Set(['poke.idleworld.online', 'idleworld.online', 'www.idleworld.online'])
const gameSlots = new Set<GameSlot>([1, 2, 3, 4])
const gameControls = new Set<GameControl>(['home', 'reload', 'back', 'forward', 'eco-on', 'eco-off', 'sleep-on', 'sleep-off'])
const observedApiPattern = /(?:pokes?|pokemon|inventory|items?|bag|backpack|balls?|box|boss(?:es)?|tokens?|rewards?|capture-log|profile|player|character|trainer|market|trade|auction|orders?|listings?|buy|sell|\/me)(?:[/?#]|$)/i

let mainWindow: BrowserWindow | null = null
const gameViews = new Map<GameSlot, WebContentsView>()
const gameViewPersistence = new Map<GameSlot, boolean>()
const attachedSlots = new Set<GameSlot>()
const characterNames = new Map<GameSlot, string>()
const inventorySnapshots = new Map<GameSlot, InventorySnapshot>()
const marketSnapshots = new Map<GameSlot, MarketSnapshot>()
const gameEcoModes = new Map<GameSlot, boolean>()
const gameSleepModes = new Map<GameSlot, boolean>()
const gameStatuses = new Map<GameSlot, GameViewStatus>()
const loadingSlots = new Set<GameSlot>()
const restoredCookieSlots = new Set<GameSlot>()
const cookieSaveTimers = new Map<GameSlot, NodeJS.Timeout>()
const huntSessions = new Map<GameSlot, HuntSession>()
const observedHuntEvents = new Map<GameSlot, string[]>()
const activePokemonObservations = new Map<GameSlot, { name: string; count: number }>()
let safeQuitStarted = false

function cookieVaultPath(slot: GameSlot): string {
  return join(app.getPath('userData'), 'secure-sessions', `conta-${slot}.bin`)
}

function allowedGameCookie(domain?: string): boolean {
  if (!domain) return false
  const normalized = domain.replace(/^\./, '').toLowerCase()
  return normalized === 'idleworld.online' || normalized.endsWith('.idleworld.online')
}

async function persistSessionCookies(slot: GameSlot): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) return
  const gameSession = session.fromPartition(`persist:pokecentral-conta-${slot}`)
  const cookies = (await gameSession.cookies.get({})).filter((cookie) => allowedGameCookie(cookie.domain))
  const safeCookies = cookies.map(({ name, value, domain, path, secure, httpOnly, sameSite, expirationDate }) => ({ name, value, domain, path, secure, httpOnly, sameSite, expirationDate }))
  const encrypted = safeStorage.encryptString(JSON.stringify(safeCookies))
  await mkdir(join(app.getPath('userData'), 'secure-sessions'), { recursive: true })
  await writeFile(cookieVaultPath(slot), encrypted)
}

function scheduleCookieVaultSave(slot: GameSlot): void {
  const previous = cookieSaveTimers.get(slot)
  if (previous) clearTimeout(previous)
  const timer = setTimeout(() => { cookieSaveTimers.delete(slot); void persistSessionCookies(slot) }, 750)
  timer.unref(); cookieSaveTimers.set(slot, timer)
}

async function restoreSessionCookies(slot: GameSlot): Promise<void> {
  if (restoredCookieSlots.has(slot)) return
  restoredCookieSlots.add(slot)
  if (!safeStorage.isEncryptionAvailable()) return
  try {
    const encrypted = await readFile(cookieVaultPath(slot))
    const records = JSON.parse(safeStorage.decryptString(encrypted)) as Array<Record<string, unknown>>
    const gameSession = session.fromPartition(`persist:pokecentral-conta-${slot}`)
    await Promise.allSettled(records.filter((cookie) => typeof cookie.domain === 'string' && allowedGameCookie(cookie.domain)).map((cookie) => {
      const domain = String(cookie.domain).replace(/^\./, '')
      return gameSession.cookies.set({
        url: `https://${domain}${typeof cookie.path === 'string' ? cookie.path : '/'}`,
        name: String(cookie.name ?? ''), value: String(cookie.value ?? ''),
        domain: String(cookie.domain), path: typeof cookie.path === 'string' ? cookie.path : '/',
        secure: cookie.secure === true, httpOnly: cookie.httpOnly === true,
        sameSite: cookie.sameSite as Electron.CookiesSetDetails['sameSite'],
        expirationDate: typeof cookie.expirationDate === 'number' ? cookie.expirationDate : undefined
      })
    }))
  } catch { /* Primeira execução ou cofre ausente: a sessão começa normalmente. */ }
}
async function flushPersistentSessions(): Promise<void> {
  await Promise.allSettled([...gameSlots].flatMap((slot) => [session.fromPartition(`persist:pokecentral-conta-${slot}`).flushStorageData(), persistSessionCookies(slot)]))
}

function scheduleSessionFlush(): void {
  const timer = setTimeout(() => { void flushPersistentSessions() }, 1_500)
  timer.unref()
}

function isGameSlot(value: unknown): value is GameSlot {
  return typeof value === 'number' && Number.isInteger(value) && gameSlots.has(value as GameSlot)
}

function isGameControl(value: unknown): value is GameControl {
  return typeof value === 'string' && gameControls.has(value as GameControl)
}

function isAllowedGameUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && allowedGameHosts.has(parsed.hostname)
  } catch {
    return false
  }
}

function normalizeBounds(value: unknown): GameViewBounds {
  if (!value || typeof value !== 'object') throw new Error('Área do navegador inválida.')
  const candidate = value as Record<string, unknown>
  for (const field of ['x', 'y', 'width', 'height'] as const) {
    if (typeof candidate[field] !== 'number' || !Number.isFinite(candidate[field])) {
      throw new Error('Área do navegador inválida.')
    }
  }
  if (!mainWindow) throw new Error('Janela principal indisponível.')
  const content = mainWindow.getContentBounds()
  const x = Math.max(0, Math.round(candidate.x as number))
  const y = Math.max(0, Math.round(candidate.y as number))
  const maxWidth = Math.max(160, content.width - x)
  const maxHeight = Math.max(120, content.height - y)
  return {
    x,
    y,
    width: Math.max(160, Math.min(Math.round(candidate.width as number), maxWidth)),
    height: Math.max(120, Math.min(Math.round(candidate.height as number), maxHeight))
  }
}

function normalizePlacements(value: unknown): GameViewPlacement[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) {
    throw new Error('A disposição deve conter de uma a quatro contas.')
  }
  const seen = new Set<GameSlot>()
  return value.map((placement) => {
    if (!placement || typeof placement !== 'object') throw new Error('Disposição inválida.')
    const candidate = placement as Record<string, unknown>
    if (!isGameSlot(candidate.slot) || seen.has(candidate.slot)) throw new Error('Conta repetida ou inválida.')
    seen.add(candidate.slot)
    const zoomFactor =
      typeof candidate.zoomFactor === 'number' && Number.isFinite(candidate.zoomFactor)
        ? Math.max(0.25, Math.min(candidate.zoomFactor, 1.5))
        : 1
    return { slot: candidate.slot, bounds: normalizeBounds(candidate.bounds), zoomFactor, persistSession: candidate.persistSession !== false }
  })
}

function sendGameStatus(status: GameViewStatus): void {
  const merged = { ...status, characterName: characterNames.get(status.slot) ?? status.characterName }
  gameStatuses.set(status.slot, merged)
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('launcher:status', merged)
}

function sendInventorySnapshot(snapshot: InventorySnapshot): void {
  inventorySnapshots.set(snapshot.slot, snapshot)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('launcher:inventory-updated', snapshot)
  }
}

function sendMarketSnapshot(snapshot: MarketSnapshot): void {
  marketSnapshots.set(snapshot.slot, snapshot)
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('launcher:market-updated', snapshot)
}

function sendHuntSession(session: HuntSession): void {
  huntSessions.set(session.slot, session)
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('launcher:hunt-updated', session)
}

function firstText(object: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = object[key]
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 80)
    if (value && typeof value === 'object') {
      const nested = value as Record<string, unknown>
      const name = nested.name ?? nested.species ?? nested.label
      if (typeof name === 'string' && name.trim()) return name.trim().slice(0, 80)
    }
  }
  return undefined
}

function firstTextDeep(root: unknown, keys: string[]): string | undefined {
  const wanted = new Set(keys.map((key) => key.toLowerCase()))
  const queue: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }]
  const visited = new Set<object>()
  while (queue.length) {
    const { value, depth } = queue.shift()!
    if (!value || typeof value !== 'object' || depth > 5 || visited.has(value as object)) continue
    visited.add(value as object)
    if (Array.isArray(value)) { for (const child of value.slice(0, 100)) queue.push({ value: child, depth: depth + 1 }); continue }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (wanted.has(key.toLowerCase())) {
        if (typeof child === 'string' && child.trim()) return child.trim().slice(0, 80)
        if (child && typeof child === 'object') {
          const record = child as Record<string, unknown>; const name = record.name ?? record.species ?? record.label
          if (typeof name === 'string' && name.trim()) return name.trim().slice(0, 80)
        }
      }
      if (child && typeof child === 'object') queue.push({ value: child, depth: depth + 1 })
    }
  }
  return undefined
}
function firstNumber(object: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = Number(object[key])
    if (Number.isFinite(value) && value >= 0) return value
  }
  return 0
}

function inspectHuntEvents(slot: GameSlot, payload: unknown): void {
  const queue: Array<{ value: unknown; depth: number }> = [{ value: payload, depth: 0 }]
  const visited = new Set<object>()
  while (queue.length) {
    const { value, depth } = queue.shift()!
    if (!value || typeof value !== 'object' || depth > 6 || visited.has(value as object)) continue
    visited.add(value as object)
    if (Array.isArray(value)) {
      for (const child of value.slice(0, 500)) queue.push({ value: child, depth: depth + 1 })
      continue
    }
    const object = value as Record<string, unknown>
    const eventName = [object.type, object.event, object.action, object.kind, object.status, object.messageType]
      .filter((entry): entry is string => typeof entry === 'string').join(' ').toLowerCase()
    const isKill = /(?:enemy|pokemon|creature|monster).*(?:defeat|killed|dead)|(?:defeat|kill|victory|combat.?end|battle.*(?:win|won))/i.test(eventName)
    if (isKill) {
      const huntName = firstTextDeep(object, ['huntName', 'hunt', 'locationName', 'location', 'areaName', 'area', 'enemyName', 'enemy', 'targetName', 'target', 'defeatedPokemon', 'opponent']) ?? 'Hunt não identificada'
      const pokemonName = firstTextDeep(object, ['activePokemonName', 'pokemonName', 'attackerName', 'activePokemon', 'attacker', 'playerPokemon', 'ally'])
      const xp = firstNumber(object, ['xpGained', 'experienceGained', 'expGained', 'gainedXp', 'xpReward', 'experienceReward', 'xp'])
      const gold = firstNumber(object, ['goldGained', 'moneyGained', 'coinsGained', 'goldReward', 'gold'])
      const captured = object.captured === true || object.isCaptured === true ? 1 : 0
      const shiny = captured && (object.shiny === true || object.isShiny === true) ? 1 : 0
      const eventId = firstText(object, ['eventId', 'battleId', 'combatId', 'killId', 'id'])
      const timestamp = firstText(object, ['timestamp', 'createdAt', 'time']) ?? ''
      const signature = eventId ? `${eventName}:${eventId}` : `${eventName}:${huntName}:${pokemonName ?? ''}:${xp}:${gold}:${timestamp || Math.floor(Date.now() / 1000)}`
      const recent = observedHuntEvents.get(slot) ?? []
      if (recent.includes(signature)) continue
      observedHuntEvents.set(slot, [...recent.slice(-199), signature])
      const now = new Date().toISOString()
      const current = huntSessions.get(slot)
      const changed = current && (current.huntName !== huntName || (pokemonName && current.pokemonName && current.pokemonName !== pokemonName))
      if (changed && current) sendHuntSession({ ...current, endedAt: now, updatedAt: now })
      const base = !current || changed ? { id: `${slot}-${Date.now()}`, slot, huntName, pokemonName, startedAt: now, updatedAt: now, kills: 0, xp: 0, gold: 0, captures: 0, shinies: 0, identityConfidence: pokemonName ? 'confirmed' as const : 'ambiguous' as const, identitySource: pokemonName ? 'game-event' as const : undefined, source: 'game-session' as const } : current
      const resolvedPokemon = pokemonName ?? base.pokemonName
      sendHuntSession({ ...base, huntName, pokemonName: resolvedPokemon, kills: base.kills + 1, xp: base.xp + xp, gold: base.gold + gold, captures: base.captures + captured, shinies: base.shinies + shiny, shinyEncounters: (base.shinyEncounters ?? 0) + shiny, shinyCaptured: (base.shinyCaptured ?? 0) + shiny, identityConfidence: pokemonName ? 'confirmed' : base.identityConfidence, identitySource: pokemonName ? 'game-event' : base.identitySource, lastKillAt: now, lastActivityAt: now, dataQuality: huntName !== 'Hunt não identificada' && Boolean(resolvedPokemon) ? 'complete' : 'partial', updatedAt: now, endedAt: undefined })
    }
    const isCaptureEvent = !isKill && /capture|captur|catch|caught|pokeball|throw|escape|escaped|flee|fled/i.test(eventName)
    if (isCaptureEvent) {
      const current = huntSessions.get(slot)
      if (current && !current.endedAt) {
        const eventId = firstText(object, ['eventId', 'captureId', 'attemptId', 'battleId', 'id'])
        const timestamp = firstText(object, ['timestamp', 'createdAt', 'time']) ?? ''
        const signature = `capture:${eventName}:${(eventId ?? timestamp) || Math.floor(Date.now() / 1000)}`
        const recent = observedHuntEvents.get(slot) ?? []
        if (!recent.includes(signature)) {
          observedHuntEvents.set(slot, [...recent.slice(-199), signature])
          const shiny = object.shiny === true || object.isShiny === true || /shiny/i.test(eventName)
          const escaped = /escape|escaped|flee|fled|failed|fail/i.test(eventName) || object.escaped === true || object.success === false
          const captured = /caught|captured|success/i.test(eventName) || object.captured === true || object.success === true
          const now = new Date().toISOString()
          sendHuntSession({ ...current, captureAttempts: (current.captureAttempts ?? 0) + 1, shinyEncounters: (current.shinyEncounters ?? 0) + (shiny ? 1 : 0), shinyCaptured: (current.shinyCaptured ?? 0) + (shiny && captured ? 1 : 0), shinyEscaped: (current.shinyEscaped ?? 0) + (shiny && escaped ? 1 : 0), lastActivityAt: now, updatedAt: now })
        }
      }
    }
    for (const [key, child] of Object.entries(object)) {
      if (child && typeof child === 'object' && !['inventory', 'pokes', 'items'].includes(key.toLowerCase())) queue.push({ value: child, depth: depth + 1 })
    }
  }
}
function safeNumber(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizeStats(value: unknown): PokemonStats | undefined {
  if (Array.isArray(value) && value.length >= 6) {
    const numbers = value.slice(0, 6).map(safeNumber)
    if (numbers.every((item) => item !== undefined)) {
      return {
        hp: numbers[0]!, attack: numbers[1]!, defense: numbers[2]!,
        specialAttack: numbers[3]!, specialDefense: numbers[4]!, speed: numbers[5]!
      }
    }
  }
  if (!value || typeof value !== 'object') return undefined
  const stats = value as Record<string, unknown>
  const result = {
    hp: safeNumber(stats.hp ?? stats.health),
    attack: safeNumber(stats.attack ?? stats.atk ?? stats.atq),
    defense: safeNumber(stats.defense ?? stats.def),
    specialAttack: safeNumber(stats.specialAttack ?? stats.spAttack ?? stats.spAtk ?? stats.spatk ?? stats.spa),
    specialDefense: safeNumber(stats.specialDefense ?? stats.spDefense ?? stats.spDef ?? stats.spdef ?? stats.spd),
    speed: safeNumber(stats.speed ?? stats.spe ?? stats.velocity)
  }
  return Object.values(result).every((item) => item !== undefined) ? result as PokemonStats : undefined
}

function normalizePokemon(value: unknown): InventoryPokemon | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  const speciesId = safeNumber(item.speciesId ?? item.pokeId ?? item.creatureId ?? item.dexId)
  const speciesRaw = item.name ?? item.speciesName ?? item.pokemonName ?? item.pokeName
  if (typeof speciesRaw !== 'string' || !speciesRaw.trim()) return null
  const idRaw = item.id ?? item.uid ?? item.pokemonId ?? `${speciesId ?? 'unknown'}-${speciesRaw}-${item.level ?? item.lvl ?? ''}`
  return {
    id: String(idRaw),
    speciesId,
    species: speciesRaw.replace(/\s+Lv\.?\s*\d+$/i, '').trim(),
    level: safeNumber(item.level ?? item.lvl),
    quality: safeNumber(item.quality ?? item.qualidade),
    ivTotal: safeNumber(item.ivTotal ?? item.iv ?? item.growthTotal),
    shiny: item.shiny === true || item.isShiny === true,
    power: safeNumber(item.power ?? item.poder ?? item.cp),
    stats: normalizeStats(item.stats ?? item.attributes ?? item.currentStats)
  }
}

function humanizeItemKey(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim()
}
const knownItemNames = new Map<number, string>([[70000, 'Bronze Boss Token']])
function normalizeGameItem(
  value: unknown,
  category: 'ball' | 'item',
  fallbackId?: string,
  catalogValue?: unknown
): InventoryGameItem | null {
  const item = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const embeddedValue = item.item ?? item.definition ?? item.itemData ?? item.meta
  const embedded = embeddedValue && typeof embeddedValue === 'object' ? embeddedValue as Record<string, unknown> : {}
  const catalog = catalogValue && typeof catalogValue === 'object' ? catalogValue as Record<string, unknown> : embedded
  const itemId = safeNumber(item.itemId ?? item.item_id ?? item.id ?? embedded.itemId ?? embedded.id ?? catalog.id ?? fallbackId)
  const quantity = safeNumber(item.quantity ?? item.qty ?? item.count ?? item.amount ?? item.value ?? value)
  if (quantity === undefined || quantity < 0) return null
  const nameRaw = item.name ?? item.displayName ?? embedded.name ?? embedded.displayName ?? catalog.name
  const descriptiveFallback = fallbackId && !/^\d+$/.test(fallbackId) ? humanizeItemKey(fallbackId) : undefined
  const detectedName = typeof nameRaw === 'string' && nameRaw.trim()
    ? nameRaw.trim()
    : descriptiveFallback ?? (category === 'ball' ? `Pokébola ${itemId ?? fallbackId ?? ''}`.trim() : `Item ${itemId ?? fallbackId ?? ''}`.trim())
  const name = itemId !== undefined && knownItemNames.has(itemId) && /^Item\s+\d+$/i.test(detectedName) ? knownItemNames.get(itemId)! : detectedName
  const id = String(itemId ?? item.id ?? fallbackId ?? name)
  return {
    id,
    itemId,
    name,
    quantity,
    category,
    gameCategory: typeof item.category === 'string' ? item.category : typeof catalog.category === 'string' ? catalog.category : undefined,
    icon: typeof item.iconUrl === 'string' ? item.iconUrl : typeof item.icon === 'string' ? item.icon : typeof catalog.iconUrl === 'string' ? catalog.iconUrl : undefined,
    npcPrice: safeNumber(item.npcPrice ?? item.priceGold ?? item.price ?? catalog.npcPrice ?? catalog.priceGold)
  }
}

function extractInventoryItems(payload: unknown): { found: boolean; items: InventoryGameItem[] } {
  const collected = new Map<string, InventoryGameItem>()
  let found = false
  const add = (item: InventoryGameItem | null): void => {
    if (!item) return
    collected.set(`${item.category}-${item.id}`, item)
  }
  const visit = (value: unknown, depth: number, inventoryContext: boolean): void => {
    if (!value || typeof value !== 'object' || depth > 6) return
    if (Array.isArray(value)) {
      const itemShaped = value.some((entry) => entry && typeof entry === 'object' && (() => {
        const record = entry as Record<string, unknown>
        return (record.quantity !== undefined || record.qty !== undefined || record.count !== undefined || record.amount !== undefined) && (record.name !== undefined || record.itemId !== undefined || record.item_id !== undefined || record.id !== undefined)
      })())
      if (inventoryContext || itemShaped) {
        found = true
        for (const item of value) add(normalizeGameItem(item, 'item'))
      }
      return
    }
    const object = value as Record<string, unknown>
    const type = String(object.type ?? object.kind ?? '').toLowerCase()

    // Catálogos e contagens seguem mudando conforme novos recursos entram no jogo.
    // Leia qualquer bloco item-like de counts + catalog sem depender do nome do item.
    if (object.counts && typeof object.counts === 'object' && !Array.isArray(object.counts) && (inventoryContext || /(inventory|items?|bag|backpack|supplies|tokens?|currencies|rewards|balls?)/.test(type))) {
      found = true
      const catalog = new Map<string, unknown>()
      const catalogEntries = Array.isArray(object.catalog)
        ? object.catalog
        : object.catalog && typeof object.catalog === 'object'
          ? Object.values(object.catalog as Record<string, unknown>)
          : []
      for (const entry of catalogEntries) {
        if (entry && typeof entry === 'object') catalog.set(String((entry as Record<string, unknown>).id ?? (entry as Record<string, unknown>).itemId), entry)
      }
      const category = /balls?/.test(type) ? 'ball' : 'item'
      for (const [id, count] of Object.entries(object.counts as Record<string, unknown>)) add(normalizeGameItem(count, category, id, catalog.get(id)))
    }

    if (type === 'balls' && object.counts && typeof object.counts === 'object') {
      found = true
      const catalog = new Map<string, unknown>()
      if (Array.isArray(object.catalog)) {
        for (const entry of object.catalog) {
          if (entry && typeof entry === 'object') catalog.set(String((entry as Record<string, unknown>).id), entry)
        }
      }
      for (const [id, count] of Object.entries(object.counts as Record<string, unknown>)) {
        add(normalizeGameItem(count, 'ball', id, catalog.get(id)))
      }
    }

    if (Array.isArray(object.balls)) {
      found = true
      for (const item of object.balls) add(normalizeGameItem(item, 'ball'))
    }
    if (Array.isArray(object.potions)) {
      found = true
      for (const item of object.potions) add(normalizeGameItem(item, 'item'))
    }

    const ownInventory = inventoryContext || /(inventory|items?|bag|backpack|supplies|tokens?|currencies|rewards)/.test(type)
    for (const key of ['inventory', 'bag', 'backpack', 'supplies', 'ownedItems', 'tokens', 'bossTokens', 'boss_tokens', 'bossItems', 'currencies', 'rewards']) {
      const child = object[key]
      if (child !== undefined) {
        found = true
        visit(child, depth + 1, true)
      }
    }
    for (const [key, child] of Object.entries(object)) {
      if (/boss.*token|token.*boss/i.test(key) && (typeof child === 'number' || typeof child === 'string' || (child && typeof child === 'object'))) {
        found = true
        add(normalizeGameItem(child, 'item', key))
      }
      if (/^(bossTokens?|boss_tokens?)$/i.test(key) && child && typeof child === 'object' && !Array.isArray(child)) {
        found = true
        for (const [token, count] of Object.entries(child as Record<string, unknown>)) {
          if (typeof count === 'number') add(normalizeGameItem(count, 'item', `${token} Boss Token`))
          else add(normalizeGameItem(count, 'item', `${token} Boss Token`))
        }
      }
    }
    if (ownInventory && Array.isArray(object.items)) {
      found = true
      for (const item of object.items) add(normalizeGameItem(item, 'item'))
    }
    if (ownInventory) {
      for (const [key, child] of Object.entries(object)) {
        if (/^\d+$/.test(key) && (typeof child === 'number' || typeof child === 'string')) add(normalizeGameItem(child, 'item', key))
        if (/boss.*token|token.*boss/i.test(key)) add(normalizeGameItem(child, 'item', key))
        if (!/^(id|type|kind|name|label|updatedAt|createdAt|version|success|status|total|capacity|maxSlots?|usedSlots?|page|pageSize|limit|offset)$/i.test(key) && (typeof child === 'number' || (typeof child === 'string' && /^\d+(?:\.\d+)?$/.test(child)))) {
          found = true
          add(normalizeGameItem(child, 'item', key))
        }
        if (child && typeof child === 'object' && !Array.isArray(child)) {
          const record = child as Record<string, unknown>
          if (record.quantity !== undefined || record.qty !== undefined || record.count !== undefined || record.amount !== undefined) add(normalizeGameItem(record, 'item', key))
        }
      }
    }

    for (const key of ['data', 'payload', 'message', 'body', 'result', 'response']) {
      if (object[key] !== undefined) visit(object[key], depth + 1, ownInventory)
    }
  }
  visit(payload, 0, false)
  return { found, items: [...collected.values()] }
}

function possibleCharacterName(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const root = payload as Record<string, unknown>
  const keys = ['player', 'me', 'character', 'trainer', 'profile', 'account']
  for (const key of keys) {
    const candidate = root[key]
    if (!candidate || typeof candidate !== 'object') continue
    const object = candidate as Record<string, unknown>
    const name = object.characterName ?? object.playerName ?? object.trainerName ?? object.nickname ?? object.name
    if (typeof name === 'string' && name.trim() && !name.includes('@')) return name.trim().slice(0, 48)
  }
  if (['player', 'profile', 'character', 'trainer', 'me'].includes(String(root.type ?? '').toLowerCase())) {
    const name = root.characterName ?? root.playerName ?? root.trainerName ?? root.nickname ?? root.name
    if (typeof name === 'string' && name.trim() && !name.includes('@')) return name.trim().slice(0, 48)
  }
  return undefined
}

function extractMarketListings(slot: GameSlot, payload: unknown): MarketListing[] {
  const capturedAt = new Date().toISOString()
  const results = new Map<string, MarketListing>()
  const visit = (value: unknown, depth: number, marketContext: boolean): void => {
    if (!value || typeof value !== 'object' || depth > 7) return
    if (Array.isArray(value)) { for (const child of value.slice(0, 2000)) visit(child, depth + 1, marketContext); return }
    const object = value as Record<string, unknown>
    const keys = Object.keys(object).join(' ')
    const context = marketContext || /market|listing|order|auction|offer|request|sell|sale|buy|compra|venda/i.test(keys + ' ' + String(object.type ?? object.kind ?? ''))
    const price = Number(object.price ?? object.unitPrice ?? object.goldPrice ?? object.value)
    const nested = (object.item ?? object.pokemon ?? object.product ?? object.asset) as Record<string, unknown> | undefined
    const name = firstText(object, ['name', 'itemName', 'pokemonName', 'species', 'title']) ?? (nested ? firstText(nested, ['name', 'species', 'label']) : undefined)
    if (context && name && Number.isFinite(price) && price >= 0) {
      const sideText = String(object.side ?? object.orderType ?? object.type ?? object.kind ?? '').toLowerCase()
      const side = /buy|request|wanted|compra|solicita/.test(sideText) ? 'request' : 'sale'
      const itemId = Number(object.itemId ?? object.pokemonId ?? nested?.id)
      const idValue = object.listingId ?? object.orderId ?? object.offerId ?? object.id
      const id = String(idValue ?? `${side}:${name}:${price}:${object.sellerId ?? object.userId ?? ''}`)
      results.set(id, {
        id, slot, side, name,
        category: String(object.category ?? nested?.category ?? (object.pokemon || object.pokemonId ? 'Pokémon' : 'Item')),
        currency: String(object.currency ?? object.currencyName ?? 'Gold'), price,
        quantity: Math.max(1, Number(object.quantity ?? object.amount ?? object.qty ?? 1) || 1),
        seller: firstText(object, ['sellerName', 'buyerName', 'playerName', 'username']),
        itemId: Number.isFinite(itemId) ? itemId : undefined,
        npcPrice: Number.isFinite(Number(object.npcPrice ?? nested?.npcPrice)) ? Number(object.npcPrice ?? nested?.npcPrice) : undefined,
        level: Number.isFinite(Number(object.level ?? nested?.level)) ? Number(object.level ?? nested?.level) : undefined,
        iv: Number.isFinite(Number(object.ivTotal ?? object.iv ?? nested?.ivTotal ?? nested?.iv)) ? Number(object.ivTotal ?? object.iv ?? nested?.ivTotal ?? nested?.iv) : undefined,
        quality: Number.isFinite(Number(object.quality ?? nested?.quality)) ? Number(object.quality ?? nested?.quality) : undefined,
        shiny: Boolean(object.shiny ?? nested?.shiny), capturedAt
      })
    }
    for (const [key, child] of Object.entries(object)) {
      if (child && typeof child === 'object') visit(child, depth + 1, context || /market|listing|order|offer|request|sale|sell|buy/i.test(key))
    }
  }
  visit(payload, 0, false)
  return [...results.values()]
}

function inspectPayload(slot: GameSlot, payload: unknown): void {
  inspectHuntEvents(slot, payload)
  const marketListings = extractMarketListings(slot, payload)
  if (marketListings.length) sendMarketSnapshot({ slot, listings: marketListings, capturedAt: new Date().toISOString(), source: 'game-session' })
  const queue: Array<{ value: unknown; depth: number }> = [{ value: payload, depth: 0 }]
  const visited = new Set<object>()
  let characterName: string | undefined
  let pokemonList: unknown[] | undefined
  const itemResult = extractInventoryItems(payload)

  while (queue.length) {
    const { value, depth } = queue.shift()!
    if (!value || typeof value !== 'object' || depth > 5) continue
    if (visited.has(value as object)) continue
    visited.add(value as object)

    if (Array.isArray(value)) {
      for (const child of value.slice(0, 1000)) queue.push({ value: child, depth: depth + 1 })
      continue
    }

    const object = value as Record<string, unknown>
    characterName ??= possibleCharacterName(object)
    if (!pokemonList && String(object.type ?? '').toLowerCase() === 'pokes' && Array.isArray(object.list)) {
      pokemonList = object.list
    } else if (!pokemonList && Array.isArray(object.pokes)) {
      pokemonList = object.pokes
    } else if (!pokemonList && Array.isArray(object.pokemon) && object.pokemon.length > 0) {
      pokemonList = object.pokemon
    }

    for (const key of ['data', 'payload', 'message', 'body', 'result', 'response']) {
      if (object[key] !== undefined) queue.push({ value: object[key], depth: depth + 1 })
    }
  }

  if (characterName && characterNames.get(slot) !== characterName) {
    characterNames.set(slot, characterName)
    const previous = gameStatuses.get(slot) ?? { slot, state: 'ready' as const }
    sendGameStatus({ ...previous, characterName })
  }

  if (!pokemonList && !itemResult.found) return
  const previous = inventorySnapshots.get(slot)
  const pokemon = pokemonList
    ? pokemonList.map(normalizePokemon).filter((item): item is InventoryPokemon => item !== null)
    : previous?.pokemon ?? []
  const items = itemResult.found
    ? [
        ...(previous?.items ?? []).filter((item) => !new Set(itemResult.items.map((incoming) => incoming.category)).has(item.category)),
        ...itemResult.items
      ]
    : previous?.items ?? []
  const snapshot: InventorySnapshot = {
    slot,
    characterName: characterNames.get(slot),
    pokemon,
    items,
    pokemonUpdated: Boolean(pokemonList),
    itemsUpdated: itemResult.found,
    capturedAt: new Date().toISOString(),
    source: 'game-session'
  }
  sendInventorySnapshot(snapshot)
}
function parseObservedText(slot: GameSlot, text: string): void {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > 20_000_000) return
  const candidates = [trimmed]
  const firstJson = Math.min(...['{', '['].map((char) => {
    const index = trimmed.indexOf(char)
    return index < 0 ? Number.POSITIVE_INFINITY : index
  }))
  if (Number.isFinite(firstJson) && firstJson > 0) candidates.push(trimmed.slice(firstJson))

  for (const candidate of candidates) {
    try {
      inspectPayload(slot, JSON.parse(candidate))
      return
    } catch {
      // O frame pode não ser JSON ou pode usar um formato binário.
    }
  }
}

function localizedNumber(text: string | undefined): number {
  if (!text) return 0
  const value = Number(text.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(value) ? Math.abs(value) : 0
}
function observedDuration(text: string): number {
  const match = text.match(/(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?\s*Tempo na hunt/i)
  return match ? ((Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0)) * 1000) : 0
}
function cleanObservedCreatureName(value: string | undefined): string {
  const normalized = (value ?? '')
    .replace(/^\[?\d+\]?\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized || normalized.length > 48 || /(Hunt Analyzer|HP|EXP|XP|Captur|Derrot|Defeated|Supply|Loot)/i.test(normalized)) return ''
  return /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'’-]+$/.test(normalized) ? normalized : ''
}
async function inspectVisibleHuntAnalyzer(slot: GameSlot, view: WebContentsView): Promise<void> {
  if (view.webContents.isDestroyed() || !isAllowedGameUrl(view.webContents.getURL())) return
  try {
    const observed = await view.webContents.executeJavaScript(`(() => {
      const visible = e => { const r=e.getBoundingClientRect(); return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight }
      const panels=[...document.querySelectorAll('div')].filter(e=>visible(e)&&/Hunt Analyzer/i.test(e.innerText||'')&&/(Derrotados|Defeated)/i.test(e.innerText||'')).sort((a,b)=>(a.innerText||'').length-(b.innerText||'').length)
      const panel=panels[0]
      const targets=[...document.querySelectorAll('body *')].filter(e=>visible(e)&&e.children.length===0&&(e.textContent||'').trim().length<=56&&/^\\[?\\d+\\]?\\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ '\\-]+$/.test((e.textContent||'').trim())).map(e=>{const r=e.getBoundingClientRect();return{text:(e.textContent||'').trim(),distance:Math.abs(r.left+r.width/2-innerWidth/2)+Math.abs(r.top+r.height/2-innerHeight/2)}}).sort((a,b)=>a.distance-b.distance)
      const team=[...document.querySelectorAll('body *')].filter(e=>visible(e)&&e.children.length===0).map(e=>{const r=e.getBoundingClientRect();return{text:(e.textContent||'').trim(),left:r.left,top:r.top}}).filter(e=>e.left<innerWidth*.3&&e.top>40&&e.text.length<40)
      const teamDetails=[...document.querySelectorAll('body *')].filter(e=>visible(e)).map(e=>{const r=e.getBoundingClientRect(),text=(e.innerText||'').trim(),match=text.match(/^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'’-]{1,32})\\s+Lv\\.?\\s*(\\d+)/i);return match&&r.left<innerWidth*.3&&r.top>40&&text.length<180?{name:match[1].trim(),level:Number(match[2]),size:text.length,top:r.top}:null}).filter(Boolean).sort((a,b)=>a.size-b.size).filter((entry,index,list)=>list.findIndex(candidate=>candidate.name.toLowerCase()===entry.name.toLowerCase()&&candidate.level===entry.level)===index).slice(0,12)
      return { text: panel?.innerText||'', target: targets[0]?.text||'', team: team.map(e=>e.text).slice(0,80), teamDetails }
    })()`, true) as { text?: string; target?: string; team?: string[]; teamDetails?: Array<{ name: string; level: number; top: number }> }
    const text = observed.text ?? ''
    if (!text) return
    const kills = localizedNumber(text.match(/([\d.]+)\s*(?:Derrotados|Defeated)/i)?.[1])
    const xp = localizedNumber(text.match(/([\d.]+)\s*XP\s*(?:ganha|gained)/i)?.[1])
    const captures = localizedNumber(text.match(/([\d.]+)\s*Capturados/i)?.[1])
    const captureValue = localizedNumber(text.match(/Capturados[^\n]*\(\+\s*\$\s*([\d.,]+)/i)?.[1])
    const lootValue = localizedNumber(text.match(/\$\s*([\d.,]+)\s*Loot/i)?.[1])
    const supplyCost = localizedNumber(text.match(/-\s*\$\s*([\d.,]+)\s*Supply/i)?.[1])
    const duration = observedDuration(text)
    const targetName = cleanObservedCreatureName(observed.target)
    const knownPokemon = inventorySnapshots.get(slot)?.pokemon ?? []
    const activeDetail = [...(observed.teamDetails ?? [])].sort((a, b) => a.top - b.top)[0]
    const activeName = activeDetail ? knownPokemon.find((pokemon) => pokemon.species.toLowerCase() === activeDetail.name.toLowerCase())?.species : undefined
    const previousObservation = activePokemonObservations.get(slot)
    const nextObservation = activeName && previousObservation?.name === activeName ? { name: activeName, count: previousObservation.count + 1 } : activeName ? { name: activeName, count: 1 } : previousObservation
    if (nextObservation) activePokemonObservations.set(slot, nextObservation)
    const pokemonName = nextObservation && nextObservation.count >= 2 ? nextObservation.name : huntSessions.get(slot)?.pokemonName
    const previousSnapshot = inventorySnapshots.get(slot)
    if (previousSnapshot && observed.teamDetails?.length) {
      const assignments = new Map<number, number>()
      const usedPokemon = new Set<number>()
      for (const detail of observed.teamDetails) {
        const bestIndex = previousSnapshot.pokemon
          .map((pokemon, index) => ({ pokemon, index }))
          .filter(({ pokemon, index }) => !usedPokemon.has(index) && pokemon.species.toLowerCase() === detail.name.toLowerCase())
          .sort((a, b) => Math.abs((a.pokemon.level ?? 0) - detail.level) - Math.abs((b.pokemon.level ?? 0) - detail.level))[0]?.index
        if (bestIndex !== undefined) {
          usedPokemon.add(bestIndex)
          assignments.set(bestIndex, detail.level)
        }
      }
      const updatedPokemon = previousSnapshot.pokemon.map((pokemon, index) => assignments.has(index) ? { ...pokemon, level: assignments.get(index) } : pokemon)
      if (updatedPokemon.some((pokemon, index) => pokemon.level !== previousSnapshot.pokemon[index]?.level)) {
        sendInventorySnapshot({ ...previousSnapshot, pokemon: updatedPokemon, pokemonUpdated: true, itemsUpdated: false, capturedAt: new Date().toISOString() })
      }
    }
    // Uma hunt pode travar antes da primeira kill. Preserve a sessão zerada quando
    // alvo e Pokémon já foram identificados para que o alerta consiga medir o tempo.
    if (!kills && !xp && !duration && !targetName && !pokemonName) return
    const now = new Date().toISOString(); const current = huntSessions.get(slot)
    const huntName = targetName || current?.huntName || 'Hunt não identificada'
    const countersReset = Boolean(current && (kills < current.kills || (duration > 0 && (current.observedDurationMs ?? 0) > duration + 30_000)))
    const changed = Boolean(current && ((targetName && current.huntName !== 'Hunt não identificada' && current.huntName !== targetName) || (pokemonName && current.pokemonName && pokemonName !== current.pokemonName) || countersReset))
    if (changed && current) sendHuntSession({ ...current, endedAt: now, updatedAt: now })
    const base = !current || changed ? { id: `${slot}-${Date.now()}`, slot, huntName, pokemonName, startedAt: new Date(Date.now() - duration).toISOString(), updatedAt: now, kills: 0, xp: 0, gold: 0, captures: 0, shinies: 0, identityConfidence: nextObservation && nextObservation.count >= 2 ? 'confirmed' as const : 'ambiguous' as const, identitySource: nextObservation && nextObservation.count >= 2 ? 'active-card' as const : undefined, source: 'game-session' as const } : current
    const activityChanged = kills > base.kills || xp > base.xp || lootValue > (base.lootValue ?? 0) || captures > base.captures
    const resolvedPokemon = pokemonName ?? base.pokemonName
    sendHuntSession({ ...base, huntName, pokemonName: resolvedPokemon, kills, xp, gold: lootValue, lootValue, captureValue, supplyCost, observedDurationMs: duration, captures, identityConfidence: nextObservation && nextObservation.count >= 2 ? 'confirmed' : base.identityConfidence, identitySource: nextObservation && nextObservation.count >= 2 ? 'active-card' : base.identitySource, updatedAt: now, lastKillAt: kills > base.kills ? now : base.lastKillAt, lastActivityAt: activityChanged ? now : base.lastActivityAt, dataQuality: huntName !== 'Hunt não identificada' && Boolean(resolvedPokemon) ? 'complete' : 'partial', endedAt: undefined })
  } catch { /* A extensão/painel pode não estar presente nesta conta. */ }
}
function startReadOnlyMonitor(slot: GameSlot, view: WebContentsView): void {
  const debuggerApi = view.webContents.debugger
  const pendingResponses = new Map<string, string>()
  try {
    if (!debuggerApi.isAttached()) debuggerApi.attach('1.3')
    void debuggerApi.sendCommand('Network.enable')
  } catch {
    return
  }

  debuggerApi.on('message', (_event, method, params) => {
    if (method === 'Network.webSocketFrameReceived') {
      const payload = (params as { response?: { payloadData?: unknown } }).response?.payloadData
      if (typeof payload === 'string') parseObservedText(slot, payload)
      return
    }

    if (method === 'Network.responseReceived') {
      const response = params as { requestId?: string; response?: { url?: string } }
      const url = response.response?.url
      if (response.requestId && url && isAllowedGameUrl(url) && observedApiPattern.test(url)) {
        pendingResponses.set(response.requestId, url)
      }
      return
    }

    if (method === 'Network.loadingFinished') {
      const requestId = (params as { requestId?: string }).requestId
      if (!requestId || !pendingResponses.has(requestId)) return
      pendingResponses.delete(requestId)
      void debuggerApi.sendCommand('Network.getResponseBody', { requestId }).then((result: unknown) => {
        const body = result as { body?: unknown; base64Encoded?: boolean }
        if (typeof body.body !== 'string') return
        const text = body.base64Encoded ? Buffer.from(body.body, 'base64').toString('utf8') : body.body
        parseObservedText(slot, text)
      }).catch(() => {})
    }
  })
}

function createGameView(slot: GameSlot, persistSession = true): WebContentsView {
  const existing = gameViews.get(slot)
  if (existing && !existing.webContents.isDestroyed() && gameViewPersistence.get(slot) === persistSession) return existing
  if (existing && !existing.webContents.isDestroyed()) {
    if (attachedSlots.has(slot) && mainWindow) {
      try { mainWindow.contentView.removeChildView(existing) } catch {}
      attachedSlots.delete(slot)
    }
    existing.webContents.close()
    gameViews.delete(slot)
  }

  const view = new WebContentsView({
    webPreferences: {
      partition: persistSession ? `persist:pokecentral-conta-${slot}` : `pokecentral-temporaria-conta-${slot}`,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false
    }
  })
  view.webContents.setBackgroundThrottling(false)
  view.webContents.setFrameRate(gameSleepModes.get(slot) ? 10 : gameEcoModes.get(slot) ? 20 : 60)

  view.webContents.session.cookies.on('changed', (_event, cookie) => { if (allowedGameCookie(cookie.domain)) scheduleCookieVaultSave(slot) })
  view.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedGameUrl(url)) void view.webContents.loadURL(url)
    else {
      try {
        const parsed = new URL(url)
        if (allowedExternalProtocols.has(parsed.protocol)) void shell.openExternal(url)
      } catch {}
    }
    return { action: 'deny' }
  })
  view.webContents.on('will-navigate', (event, url) => {
    if (isAllowedGameUrl(url)) return
    event.preventDefault()
    try {
      const parsed = new URL(url)
      if (allowedExternalProtocols.has(parsed.protocol)) void shell.openExternal(url)
    } catch {}
  })
  view.webContents.on('did-start-loading', () => sendGameStatus({ slot, state: 'loading', url: view.webContents.getURL() }))
  view.webContents.on('did-finish-load', () => {
    void view.webContents.insertCSS(
      'html,body{scrollbar-width:none!important}::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}'
    )
    sendGameStatus({ slot, state: 'ready', url: view.webContents.getURL() })
    scheduleSessionFlush()
  })
  view.webContents.on('unresponsive', () => {
    sendGameStatus({ slot, state: 'stalled', url: view.webContents.getURL(), message: 'A página parou de responder. Confirme antes de recarregar.' })
  })
  view.webContents.on('responsive', () => {
    const previous = gameStatuses.get(slot)
    if (previous?.state === 'stalled') sendGameStatus({ slot, state: 'ready', url: view.webContents.getURL(), message: 'A página voltou a responder.' })
  })
  view.webContents.on('did-fail-load', (_event, code, description, url, mainFrame) => {
    if (mainFrame && code !== -3) sendGameStatus({ slot, state: 'error', url, message: description })
  })
  view.webContents.on('render-process-gone', (_event, details) => {
    sendGameStatus({ slot, state: 'error', message: `A sessão foi interrompida: ${details.reason}` })
  })

  startReadOnlyMonitor(slot, view)
  const huntAnalyzerTimer = setInterval(() => { void inspectVisibleHuntAnalyzer(slot, view) }, 5_000)
  huntAnalyzerTimer.unref()
  view.webContents.once('destroyed', () => clearInterval(huntAnalyzerTimer))
  gameViews.set(slot, view)
  gameViewPersistence.set(slot, persistSession)
  return view
}

function detachAllGameViews(): void {
  if (!mainWindow) return
  for (const slot of attachedSlots) {
    const view = gameViews.get(slot)
    if (!view) continue
    try { mainWindow.contentView.removeChildView(view) } catch {}
  }
  attachedSlots.clear()
}

async function showGameLayout(rawPlacements: unknown): Promise<GameViewStatus[]> {
  if (!mainWindow) throw new Error('Janela principal indisponível.')
  const placements = normalizePlacements(rawPlacements)
  const requestedSlots = new Set(placements.map(({ slot }) => slot))

  for (const slot of [...attachedSlots]) {
    if (requestedSlots.has(slot)) continue
    const view = gameViews.get(slot)
    if (view) {
      try { mainWindow.contentView.removeChildView(view) } catch {}
    }
    attachedSlots.delete(slot)
  }

  for (const placement of placements) {
    const view = createGameView(placement.slot, placement.persistSession)
    if (!attachedSlots.has(placement.slot)) {
      mainWindow.contentView.addChildView(view)
      attachedSlots.add(placement.slot)
    }
    view.setBounds(placement.bounds)
    view.webContents.setZoomFactor(placement.zoomFactor ?? 1)

    if (!view.webContents.getURL() && !view.webContents.isLoading() && !loadingSlots.has(placement.slot)) {
      await restoreSessionCookies(placement.slot)
      loadingSlots.add(placement.slot)
      sendGameStatus({ slot: placement.slot, state: 'loading', url: GAME_HOME_URL })
      void view.webContents.loadURL(GAME_HOME_URL)
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          if (!message.includes('ERR_ABORTED')) {
            sendGameStatus({ slot: placement.slot, state: 'error', url: GAME_HOME_URL, message })
          }
        })
        .finally(() => loadingSlots.delete(placement.slot))
    }
  }

  const statuses = placements.map(({ slot }) => {
    const previous = gameStatuses.get(slot)
    const loading = gameViews.get(slot)?.webContents.isLoading()
    return {
      slot,
      state: loading ? 'loading' as const : previous?.state === 'stalled' ? 'stalled' as const : 'ready' as const,
      url: gameViews.get(slot)?.webContents.getURL(),
      characterName: characterNames.get(slot),
      message: previous?.state === 'stalled' ? previous.message : undefined
    }
  })
  statuses.forEach(sendGameStatus)
  return statuses
}

async function updateGameLayout(rawPlacements: unknown): Promise<GameViewStatus[]> {
  return showGameLayout(rawPlacements)
}

async function controlGameAccount(slot: GameSlot, action: GameControl): Promise<void> {
  const view = gameViews.get(slot)
  if (action === 'sleep-on' || action === 'sleep-off') {
    const enabled = action === 'sleep-on'
    gameSleepModes.set(slot, enabled)
    if (view && !view.webContents.isDestroyed()) {
      view.webContents.setBackgroundThrottling(false)
      view.webContents.setFrameRate(enabled ? 10 : gameEcoModes.get(slot) ? 20 : 60)
    }
    return
  }
  if (action === 'eco-on' || action === 'eco-off') {
    const enabled = action === 'eco-on'
    gameEcoModes.set(slot, enabled)
    if (view && !view.webContents.isDestroyed() && !gameSleepModes.get(slot)) view.webContents.setFrameRate(enabled ? 20 : 60)
    return
  }
  if (!view || view.webContents.isDestroyed()) return
  if (action === 'home') await view.webContents.loadURL(GAME_HOME_URL)
  if (action === 'reload') view.webContents.reload()
  if (action === 'back' && view.webContents.navigationHistory.canGoBack()) view.webContents.navigationHistory.goBack()
  if (action === 'forward' && view.webContents.navigationHistory.canGoForward()) view.webContents.navigationHistory.goForward()
}

async function removeGameAccount(slot: GameSlot, clearSession: boolean): Promise<void> {
  const view = gameViews.get(slot)
  if (view && !view.webContents.isDestroyed()) {
    if (attachedSlots.has(slot) && mainWindow) {
      try { mainWindow.contentView.removeChildView(view) } catch {}
      attachedSlots.delete(slot)
    }
    view.webContents.close()
  }
  gameViews.delete(slot); gameViewPersistence.delete(slot); gameStatuses.delete(slot); inventorySnapshots.delete(slot); marketSnapshots.delete(slot); huntSessions.delete(slot); characterNames.delete(slot); activePokemonObservations.delete(slot)
  if (clearSession) {
    const partition = `persist:pokecentral-conta-${slot}`
    await session.fromPartition(partition).clearStorageData()
    await unlink(cookieVaultPath(slot)).catch(() => {})
    restoredCookieSlots.delete(slot)
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#12100c',
    icon: app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(app.getAppPath(), 'resources', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    for (const view of gameViews.values()) if (!view.webContents.isDestroyed()) view.webContents.close()
    gameViews.clear()
    gameViewPersistence.clear()
    attachedSlots.clear()
    mainWindow = null
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (allowedExternalProtocols.has(parsed.protocol)) void shell.openExternal(url)
    } catch {}
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault()
  })
  if (process.env.ELECTRON_RENDERER_URL) void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

async function selectImportFile(): Promise<ImportedFile | null> {
  const result = await dialog.showOpenDialog({
    title: 'Importar dados do inventário',
    properties: ['openFile'],
    filters: [
      { name: 'Arquivos compatíveis', extensions: ['json', 'csv', 'png', 'jpg', 'jpeg', 'webp'] },
      { name: 'Dados estruturados', extensions: ['json', 'csv'] },
      { name: 'Capturas de tela', extensions: ['png', 'jpg', 'jpeg', 'webp'] }
    ]
  })
  if (result.canceled || result.filePaths.length !== 1) return null
  const filePath = result.filePaths[0]
  const extension = extname(filePath).toLowerCase()
  if (!allowedExtensions.has(extension)) throw new Error('Formato de arquivo não permitido.')
  const fileStats = await stat(filePath)
  if (!fileStats.isFile() || fileStats.size > MAX_IMPORT_BYTES) throw new Error('O arquivo deve ter no máximo 15 MB.')
  const buffer = await readFile(filePath)
  const imageMime: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }
  if (extension === '.json' || extension === '.csv') {
    return {
      name: filePath.split(/[\\/]/).pop() ?? 'inventario',
      kind: extension === '.json' ? 'json' : 'csv',
      mimeType: extension === '.json' ? 'application/json' : 'text/csv',
      content: buffer.toString('utf8')
    }
  }
  const mimeType = imageMime[extension]
  return {
    name: filePath.split(/[\\/]/).pop() ?? 'captura',
    kind: 'image',
    mimeType,
    content: `data:${mimeType};base64,${buffer.toString('base64')}`
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('br.com.pokecentral.desktop')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  const sessionFlushInterval = setInterval(() => { void flushPersistentSessions() }, 30_000)
  sessionFlushInterval.unref()
  ipcMain.handle('imports:select-file', selectImportFile)
  ipcMain.handle('collection:capability', () => getCollectionCapability())
  ipcMain.handle('share:copy-card', (_event, rawPayload: unknown) => {
    if (!rawPayload || typeof rawPayload !== 'object') throw new Error('Conteúdo de compartilhamento inválido.')
    const payload = rawPayload as Record<string, unknown>
    if (typeof payload.text !== 'string' || payload.text.length > 5000) throw new Error('Texto de compartilhamento inválido.')
    const imageDataUrl = payload.imageDataUrl
    if (imageDataUrl !== undefined) {
      if (typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/png;base64,') || imageDataUrl.length > 8_000_000) {
        throw new Error('Cartão de compartilhamento inválido.')
      }
      const image = nativeImage.createFromDataURL(imageDataUrl)
      if (image.isEmpty()) throw new Error('Não foi possível preparar o cartão.')
      clipboard.write({ text: payload.text, image })
      return
    }
    clipboard.writeText(payload.text)
  })
  ipcMain.handle('share:open-url', (_event, rawUrl: unknown) => {
    if (typeof rawUrl !== 'string' || rawUrl.length > 4000) throw new Error('Link de compartilhamento inválido.')
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'https:' || !allowedShareHosts.has(parsed.hostname)) throw new Error('Destino não permitido.')
    return shell.openExternal(parsed.toString())
  })
  ipcMain.handle('launcher:show-layout', (_event, placements: unknown) => showGameLayout(placements))
  ipcMain.handle('launcher:update-layout', (_event, placements: unknown) => updateGameLayout(placements))
  ipcMain.handle('launcher:hide-layout', () => detachAllGameViews())
  ipcMain.handle('launcher:control', (_event, slot: unknown, action: unknown) => {
    if (!isGameSlot(slot) || !isGameControl(action)) throw new Error('Comando inválido.')
    return controlGameAccount(slot, action)
  })
  ipcMain.handle('launcher:remove-account', (_event, slot: unknown, clearSession: unknown) => {
    if (!isGameSlot(slot) || typeof clearSession !== 'boolean') throw new Error('Conta inválida.')
    return removeGameAccount(slot, clearSession)
  })

  ipcMain.handle('launcher:inventory', (_event, slot: unknown) => {
    if (!isGameSlot(slot)) throw new Error('Conta inválida.')
    return inventorySnapshots.get(slot) ?? null
  })
  ipcMain.handle('launcher:market', (_event, slot: unknown) => {
    if (!isGameSlot(slot)) throw new Error('Conta inválida.')
    return marketSnapshots.get(slot) ?? null
  })
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', (event) => {
  if (safeQuitStarted) return
  event.preventDefault()
  safeQuitStarted = true
  void flushPersistentSessions().finally(() => app.quit())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
