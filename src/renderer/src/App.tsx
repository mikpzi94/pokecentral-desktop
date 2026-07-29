import { useEffect, useMemo, useRef, useState } from 'react'
import type { Account, GameSlot, HuntSession, InventoryItem, InventorySnapshot, LocalListing, MarketListing, Pokemon } from '../../shared/types'
import InventoryImage, { itemImageUrl, pokemonSpriteUrl } from './InventoryImage'
import LabPanel from './LabPanel'
import LauncherPanel from './LauncherPanel'
import HuntPanel, { type HuntPreferences } from './HuntPanel'
import ShowcasePanel, { ListingEditor } from './ShowcasePanel'
import MarketPanel from './MarketPanel'
import { analyzePokemon, calculatedPower, creatureFor, itemCatalogFor, qualityTier, qualityTierOptions } from './lib/pokemon-analysis'
import { recommendHuntsCalibrated as recommendHunts } from './lib/hunt-analysis'

const STORAGE_KEY = 'pokecentral.desktop.v1'
const SIDEBAR_KEY = 'pokecentral.sidebar.collapsed'
const SETTINGS_KEY = 'pokecentral.settings.v1'
type TrackedItem = { name: string; low: number }
type AppSettings = HuntPreferences & { keepLogin: true; ecoMode: boolean; sleepMode: boolean; trackedItems: TrackedItem[] }
const DEFAULT_SETTINGS: AppSettings = { keepLogin: true, ecoMode: false, sleepMode: false, trackedItems: [{ name: 'Ultra Ball', low: 100 }, { name: 'Idle Ball', low: 100 }], soundEnabled: true, notifyShiny: true, stallMinutes: 10 }
function loadSettings(): AppSettings {
  try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<AppSettings>), keepLogin: true } } catch { return DEFAULT_SETTINGS }
}
const defaultAccounts: Account[] = [
  { id: crypto.randomUUID(), name: 'Conta 1', slot: 1, status: 'disconnected' }
]

type SavedState = { accounts: Account[]; pokemon: Pokemon[]; items?: InventoryItem[]; listings?: LocalListing[]; huntSessions?: HuntSession[] }
type View = 'launcher' | 'dashboard' | 'lab' | 'hunts' | 'market' | 'showcase'
type InventoryTab = 'all' | 'pokemon' | 'balls' | 'items'
type SortColumn = 'account' | 'species' | 'level' | 'iv' | 'quality' | 'rarity' | 'potential' | 'power'
type SortDirection = 'asc' | 'desc'

const LISTING_SEQUENCE_KEY = 'pokecentral.showcase.code-sequences.v1'

function listingSequences(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(LISTING_SEQUENCE_KEY) ?? '{}') as Record<string, number> } catch { return {} }
}

function saveListingSequences(sequences: Record<string, number>): void {
  localStorage.setItem(LISTING_SEQUENCE_KEY, JSON.stringify(sequences))
}

function assignListingCodes(accounts: Account[], listings: LocalListing[]): LocalListing[] {
  const slotByAccount = new Map(accounts.map((account) => [account.id, account.slot]))
  const sequences = listingSequences()
  const counters = new Map<number, number>(Object.entries(sequences).map(([slot, value]) => [Number(slot), value]))
  for (const listing of listings) {
    const match = listing.publicCode?.match(/^AC([1-4])-(\d{3,})$/)
    if (match) counters.set(Number(match[1]), Math.max(counters.get(Number(match[1])) ?? 0, Number(match[2])))
  }
  const assigned = [...listings].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).map((listing) => {
    if (/^AC[1-4]-\d{3,}$/.test(listing.publicCode ?? '')) return listing
    const slot = slotByAccount.get(listing.accountId) ?? 1
    const sequence = (counters.get(slot) ?? 0) + 1
    counters.set(slot, sequence)
    return { ...listing, publicCode: `AC${slot}-${String(sequence).padStart(3, '0')}` }
  })
  for (const [slot, sequence] of counters) sequences[String(slot)] = Math.max(sequences[String(slot)] ?? 0, sequence)
  saveListingSequences(sequences)
  return assigned
}

function nextListingCode(accounts: Account[], listings: LocalListing[], accountId: string): string {
  const slot = accounts.find((account) => account.id === accountId)?.slot ?? 1
  const sequences = listingSequences()
  const highest = listings.reduce((maximum, listing) => {
    const match = listing.publicCode?.match(new RegExp(`^AC${slot}-(\\d+)$`))
    return match ? Math.max(maximum, Number(match[1])) : maximum
  }, sequences[String(slot)] ?? 0)
  const next = highest + 1
  sequences[String(slot)] = next
  saveListingSequences(sequences)
  return `AC${slot}-${String(next).padStart(3, '0')}`
}
function loadState(): { accounts: Account[]; pokemon: Pokemon[]; items: InventoryItem[]; listings: LocalListing[]; huntSessions: HuntSession[] } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as SavedState
      const listings = assignListingCodes(parsed.accounts, (parsed.listings ?? []).map((entry) => ({ ...entry, status: entry.status ?? 'active' })))
      const huntSessions = (parsed.huntSessions ?? []).map((entry) => !entry.endedAt && Date.now() - new Date(entry.updatedAt).getTime() > 60_000 ? { ...entry, endedAt: entry.updatedAt } : entry)
      return { accounts: parsed.accounts, pokemon: parsed.pokemon, items: parsed.items ?? [], listings, huntSessions }
    }
  } catch {
    // Um cache inválido não deve impedir o inventário de abrir.
  }
  return { accounts: defaultAccounts, pokemon: [], items: [], listings: [], huntSessions: [] }
}

function optionalFilterNumber(value: string): number | undefined {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return undefined
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

function pokemonQuality(entry: Pokemon): number {
  return optionalFilterNumber(entry.quality ?? '') ?? 0
}

export default function App(): React.JSX.Element {
  const initial = useMemo(loadState, [])
  const [accounts, setAccounts] = useState(initial.accounts)
  const [pokemon, setPokemon] = useState(initial.pokemon)
  const [items, setItems] = useState(initial.items)
  const [listings, setListings] = useState(initial.listings)
  const [huntSessions, setHuntSessions] = useState(initial.huntSessions)
  const [marketListings, setMarketListings] = useState<MarketListing[]>([])
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const [selectedAccountId, setSelectedAccountId] = useState(initial.accounts[0]?.id ?? '')
  const [message, setMessage] = useState('Inventário local pronto.')
  const [activeView, setActiveView] = useState<View>('launcher')
  const [launcherMode, setLauncherMode] = useState<'grid' | 'single'>('grid')
  const [accountOpenRequest, setAccountOpenRequest] = useState(0)
  const [gridOpenRequest, setGridOpenRequest] = useState(0)
  const [activeTab, setActiveTab] = useState<InventoryTab>('all')
  const [query, setQuery] = useState('')
  const [accountFilter, setAccountFilter] = useState('all')
  const [levelMin, setLevelMin] = useState('')
  const [levelMax, setLevelMax] = useState('')
  const [ivMin, setIvMin] = useState('')
  const [ivMax, setIvMax] = useState('')
  const [qualityMin, setQualityMin] = useState('')
  const [qualityMax, setQualityMax] = useState('')
  const [selectedRarities, setSelectedRarities] = useState<string[]>([])
  const [shinyOnly, setShinyOnly] = useState(false)
  const [sortColumn, setSortColumn] = useState<SortColumn>('species')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === 'true')
  const [listingPokemonId, setListingPokemonId] = useState<string | null>(null)
  const [labPokemonId, setLabPokemonId] = useState<string | null>(null)
  const [labRequestVersion, setLabRequestVersion] = useState(0)
  const [accountsManagerOpen, setAccountsManagerOpen] = useState(false)
  const accountsRef = useRef(accounts)
  const pokemonRef = useRef(pokemon)
  const huntShinyRef = useRef(new Map<string, number>())

  useEffect(() => {
    accountsRef.current = accounts
    pokemonRef.current = pokemon
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accounts, pokemon, items, listings, huntSessions }))
  }, [accounts, huntSessions, items, listings, pokemon])

  useEffect(() => { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) }, [settings])

  useEffect(() => {
    void Promise.all(accounts.map((account) => window.pokecentral.getMarketSnapshot(account.slot))).then((snapshots) => {
      setMarketListings(snapshots.flatMap((snapshot) => snapshot?.listings ?? []))
    })
  }, [accounts.length])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, String(sidebarCollapsed))
  }, [sidebarCollapsed])

  useEffect(() => {
    const applySnapshot = (snapshot: InventorySnapshot): void => {
      const account = accountsRef.current.find((entry) => entry.slot === snapshot.slot)
      if (!account) return

      setAccounts((current) => current.map((entry) => entry.slot === snapshot.slot
        ? {
            ...entry,
            characterName: snapshot.characterName ?? entry.characterName,
            status: 'ready',
            lastSync: snapshot.capturedAt
          }
        : entry))

      if (snapshot.pokemonUpdated) {
        const synchronized: Pokemon[] = snapshot.pokemon.map((entry) => ({
          id: `game-${account.id}-${entry.id}`,
          accountId: account.id,
          speciesId: entry.speciesId,
          species: entry.species,
          level: entry.level,
          quality: entry.quality === undefined ? undefined : String(entry.quality),
          iv: entry.ivTotal,
          shiny: entry.shiny,
          power: entry.power,
          stats: entry.stats,
          source: 'assisted',
          sourceName: `Poke Idle World · Conta ${snapshot.slot}`,
          importedAt: snapshot.capturedAt
        }))
        setPokemon((current) => [
          ...current.filter((entry) => entry.accountId !== account.id || entry.source !== 'assisted'),
          ...synchronized
        ])
        const synchronizedIds = new Set(synchronized.map((entry) => entry.id))
        setListings((current) => current.map((listing) => {
          if (listing.accountId !== account.id || listing.status === 'sold') return listing
          const stillInAccount = synchronizedIds.has(listing.pokemonId)
          if (!stillInAccount && (listing.status ?? 'active') === 'active') {
            return { ...listing, status: 'auto-removed', removedAt: snapshot.capturedAt, updatedAt: snapshot.capturedAt }
          }
          if (stillInAccount && listing.status === 'auto-removed') {
            const refreshed = synchronized.find((entry) => entry.id === listing.pokemonId) ?? listing.pokemon
            return { ...listing, pokemon: refreshed, status: 'active', removedAt: undefined, updatedAt: snapshot.capturedAt }
          }
          if (stillInAccount) {
            const refreshed = synchronized.find((entry) => entry.id === listing.pokemonId)
            return refreshed ? { ...listing, pokemon: refreshed, updatedAt: snapshot.capturedAt } : listing
          }
          return listing
        }))
      }

      if (snapshot.itemsUpdated) {
        const synchronizedItems: InventoryItem[] = snapshot.items.map((entry) => {
          const catalog = entry.category === 'item' ? itemCatalogFor(entry.itemId) : undefined
          return {
            id: `game-item-${account.id}-${entry.category}-${entry.id}`,
            accountId: account.id,
            itemId: entry.itemId,
            name: catalog?.name ?? entry.name,
            quantity: entry.quantity,
            category: entry.category,
            gameCategory: entry.gameCategory ?? catalog?.category,
            icon: entry.icon ?? catalog?.icon ?? undefined,
            npcPrice: entry.npcPrice ?? catalog?.npcPrice ?? undefined,
            importedAt: snapshot.capturedAt
          }
        })
        setItems((current) => [
          ...current.filter((entry) => entry.accountId !== account.id),
          ...synchronizedItems
        ])
      }

      const parts: string[] = []
      if (snapshot.pokemonUpdated) parts.push(`${snapshot.pokemon.length} Pokémon`)
      if (snapshot.itemsUpdated) parts.push(`${snapshot.items.length} tipos de item`)
      if (parts.length) setMessage(`${parts.join(' e ')} sincronizados da Conta ${snapshot.slot}.`)
    }

    const stopInventory = window.pokecentral.onInventorySnapshot(applySnapshot)
    const stopMarket = window.pokecentral.onMarketSnapshot((snapshot) => setMarketListings((current) => [...current.filter((entry) => entry.slot !== snapshot.slot), ...snapshot.listings]))
    const stopHunts = window.pokecentral.onHuntSession((session) => {
      const previousShinies = huntShinyRef.current.get(session.id) ?? 0
      huntShinyRef.current.set(session.id, session.shinies)
      if (session.shinies > previousShinies && settings.notifyShiny) {
        setMessage(`✦ Shiny capturado na Conta ${session.slot}!`)
        if (settings.soundEnabled) {
          const audio = new AudioContext(); const oscillator = audio.createOscillator(); const gain = audio.createGain()
          oscillator.frequency.value = 880; gain.gain.value = 0.08; oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + 0.35)
        }
      }
      setHuntSessions((current) => {
        const existing = current.find((entry) => entry.id === session.id)
        let estimateAtStart = existing?.estimateAtStart
        if (!estimateAtStart && session.pokemonName && session.huntName !== 'Hunt não identificada') {
          const account = accountsRef.current.find((entry) => entry.slot === session.slot)
          const owned = pokemonRef.current.find((entry) => entry.accountId === account?.id && entry.species.toLowerCase() === session.pokemonName?.toLowerCase())
          const estimate = owned ? recommendHunts(owned, Number(owned.level ?? 1), current.filter((entry) => entry.id !== session.id)).find((entry) => entry.hunt.name.toLowerCase() === session.huntName.toLowerCase()) : undefined
          if (estimate) estimateAtStart = { xpPerHour: estimate.estimatedXpPerHour, lootPerHour: estimate.estimatedLootPerHour, killsPerHour: estimate.estimatedKillsPerHour, generatedAt: session.startedAt, confidence: estimate.confidence }
        }
        const enriched = { ...existing, ...session, estimateAtStart }
        return [enriched, ...current.filter((entry) => entry.id !== session.id)].slice(0, 2000)
      })
    })
    const stopStatus = window.pokecentral.onGameStatus((status) => {
      setAccounts((current) => current.map((entry) => entry.slot === status.slot
        ? {
            ...entry,
            characterName: status.characterName ?? entry.characterName,
            status: status.state === 'ready' ? 'ready' : status.state === 'error' ? 'attention' : entry.status
          }
        : entry))
    })
    return () => { stopInventory(); stopMarket(); stopHunts(); stopStatus() }
  }, [settings.notifyShiny, settings.soundEnabled])

  const filteredPokemon = useMemo(() => {
    const minimumLevel = optionalFilterNumber(levelMin)
    const maximumLevel = optionalFilterNumber(levelMax)
    const minimumIv = optionalFilterNumber(ivMin)
    const maximumIv = optionalFilterNumber(ivMax)
    const minimumQuality = optionalFilterNumber(qualityMin)
    const maximumQuality = optionalFilterNumber(qualityMax)
    const accountSlots = new Map(accounts.map((account) => [account.id, account.slot]))
    const term = query.trim().toLowerCase()
    const entries = pokemon.filter((entry) => {
      if (accountFilter !== 'all' && entry.accountId !== accountFilter) return false
      if (term && !entry.species.toLowerCase().includes(term)) return false
      if (minimumLevel !== undefined && (entry.level ?? 0) < minimumLevel) return false
      if (maximumLevel !== undefined && (entry.level ?? 0) > maximumLevel) return false
      if (minimumIv !== undefined && (entry.iv ?? 0) < minimumIv) return false
      if (maximumIv !== undefined && (entry.iv ?? 0) > maximumIv) return false
      const quality = pokemonQuality(entry)
      if (minimumQuality !== undefined && quality < minimumQuality) return false
      if (maximumQuality !== undefined && quality > maximumQuality) return false
      const tier = qualityTier(entry.quality)
      if (selectedRarities.length && (!tier || !selectedRarities.includes(tier.key))) return false
      if (shinyOnly && !entry.shiny) return false
      return true
    })
    return entries.sort((left, right) => {
      let comparison = 0
      if (sortColumn === 'account') comparison = (accountSlots.get(left.accountId) ?? 0) - (accountSlots.get(right.accountId) ?? 0)
      if (sortColumn === 'species') comparison = left.species.localeCompare(right.species, 'pt-BR')
      if (sortColumn === 'level') comparison = (left.level ?? 0) - (right.level ?? 0)
      if (sortColumn === 'iv') comparison = (left.iv ?? 0) - (right.iv ?? 0)
      if (sortColumn === 'quality') comparison = pokemonQuality(left) - pokemonQuality(right)
      if (sortColumn === 'rarity') comparison = qualityTierOptions.findIndex((tier) => tier.key === qualityTier(left.quality)?.key) - qualityTierOptions.findIndex((tier) => tier.key === qualityTier(right.quality)?.key)
      if (sortColumn === 'potential') comparison = (analyzePokemon(left).score ?? -1) - (analyzePokemon(right).score ?? -1)
      if (sortColumn === 'power') comparison = (calculatedPower(left) ?? -1) - (calculatedPower(right) ?? -1)
      if (comparison === 0) comparison = left.species.localeCompare(right.species, 'pt-BR') || left.id.localeCompare(right.id)
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [accountFilter, accounts, ivMax, ivMin, levelMax, levelMin, pokemon, qualityMax, qualityMin, query, selectedRarities, shinyOnly, sortColumn, sortDirection])

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase()
    return items.filter((entry) => {
      if (accountFilter !== 'all' && entry.accountId !== accountFilter) return false
      if (activeTab === 'balls' && entry.category !== 'ball') return false
      if (activeTab === 'items' && entry.category !== 'item') return false
      return !term || entry.name.toLowerCase().includes(term)
    }).sort((left, right) => right.quantity - left.quantity || left.name.localeCompare(right.name, 'pt-BR'))
  }, [accountFilter, activeTab, items, query])

  function addAccount(): void {
    if (accounts.length >= 4) { setMessage('O limite é de quatro contas.'); return }
    const used = new Set(accounts.map((account) => account.slot))
    const slot = ([1, 2, 3, 4] as GameSlot[]).find((candidate) => !used.has(candidate)) ?? 1
    const account: Account = { id: crypto.randomUUID(), name: `Conta ${slot}`, slot, status: 'disconnected' }
    setAccounts((current) => [...current, account].sort((left, right) => left.slot - right.slot))
    setSelectedAccountId(account.id)
  }

  function removeAccount(account: Account): void {
    if (!window.confirm(`Remover a Conta ${account.slot} (${account.characterName ?? 'sem personagem'}) do aplicativo? O histórico medido será preservado.`)) return
    const clearSession = window.confirm('Também deseja apagar o login salvo desta conta?\n\nOK: apaga a sessão protegida.\nCancelar: preserva o login para reutilizar este slot depois.')
    void window.pokecentral.removeGameAccount(account.slot, clearSession)
    setAccounts((current) => current.filter((entry) => entry.id !== account.id))
    setPokemon((current) => current.filter((entry) => entry.accountId !== account.id))
    setItems((current) => current.filter((entry) => entry.accountId !== account.id))
    setListings((current) => current.map((entry) => entry.accountId === account.id && (entry.status ?? 'active') === 'active' ? { ...entry, status: 'auto-removed', removedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : entry))
    setSelectedAccountId((current) => current === account.id ? accounts.find((entry) => entry.id !== account.id)?.id ?? '' : current)
    setMessage(`Conta ${account.slot} removida. ${clearSession ? 'O login salvo também foi apagado.' : 'O login salvo foi preservado.'}`)
  }

  function clearFilters(): void {
    setQuery(''); setAccountFilter('all'); setLevelMin(''); setLevelMax(''); setIvMin(''); setIvMax(''); setQualityMin(''); setQualityMax('')
    setSelectedRarities([]); setShinyOnly(false); setSortColumn('species'); setSortDirection('asc')
  }

  function sortPokemonBy(column: SortColumn): void {
    if (sortColumn === column) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortColumn(column)
    setSortDirection(column === 'account' || column === 'species' || column === 'rarity' ? 'asc' : 'desc')
  }

  function toggleRarity(key: string): void {
    setSelectedRarities((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])
  }

  function saveListing(price: number, negotiable: boolean): void {
    const selectedPokemon = pokemon.find((entry) => entry.id === listingPokemonId)
      ?? listings.find((entry) => entry.pokemonId === listingPokemonId)?.pokemon
    if (!selectedPokemon) return
    const now = new Date().toISOString()
    setListings((current) => {
      const existing = current.find((entry) => entry.pokemonId === selectedPokemon.id)
      if (existing) {
        return current.map((entry) => entry.id === existing.id
          ? { ...entry, publicCode: entry.publicCode ?? nextListingCode(accounts, current, selectedPokemon.accountId), pokemon: selectedPokemon, accountId: selectedPokemon.accountId, price, negotiable, status: 'active', removedAt: undefined, priceUpdatedAt: entry.price === price ? entry.priceUpdatedAt : now, priceReviewDismissedAt: entry.price === price ? entry.priceReviewDismissedAt : undefined, updatedAt: now }
          : entry)
      }
      return [...current, {
        id: crypto.randomUUID(), pokemonId: selectedPokemon.id, accountId: selectedPokemon.accountId,
        pokemon: selectedPokemon, publicCode: nextListingCode(accounts, current, selectedPokemon.accountId), price, negotiable, status: 'active', createdAt: now, updatedAt: now, priceUpdatedAt: now
      }]
    })
    setListingPokemonId(null)
    setMessage(`${selectedPokemon.species} foi adicionado à sua vitrine local.`)
  }

  function archiveListing(listingId: string): void {
    const now = new Date().toISOString()
    setListings((current) => current.map((entry) => entry.id === listingId
      ? { ...entry, status: 'auto-removed', removedAt: now, updatedAt: now }
      : entry))
  }

  function markListingSold(listingId: string): void {
    const now = new Date().toISOString()
    setListings((current) => current.map((entry) => entry.id === listingId
      ? { ...entry, status: 'sold', removedAt: now, updatedAt: now }
      : entry))
  }

  function restoreListing(listingId: string): void {
    const listing = listings.find((entry) => entry.id === listingId)
    if (!listing || !pokemon.some((entry) => entry.id === listing.pokemonId)) {
      setMessage('Esse Pokémon não está mais na conta e não pode voltar para os anúncios ativos.')
      return
    }
    const now = new Date().toISOString()
    setListings((current) => current.map((entry) => entry.id === listingId
      ? { ...entry, status: 'active', removedAt: undefined, updatedAt: now }
      : entry))
  }

  function deleteListing(listingId: string): void {
    if (!window.confirm('Apagar este anúncio definitivamente do histórico local?')) return
    setListings((current) => current.filter((entry) => entry.id !== listingId))
  }
  const selectedSlot = accounts.find((account) => account.id === selectedAccountId)?.slot ?? 1
  const ballCount = items.filter((entry) => entry.category === 'ball').reduce((sum, entry) => sum + entry.quantity, 0)
  const itemCount = items.filter((entry) => entry.category === 'item').reduce((sum, entry) => sum + entry.quantity, 0)
  const showPokemon = activeTab === 'all' || activeTab === 'pokemon'
  const showItems = activeTab === 'all' || activeTab === 'balls' || activeTab === 'items'

  function inventoryCountFor(accountId?: string): number {
    const accountPokemon = pokemon.filter((entry) => !accountId || entry.accountId === accountId).length
    const accountItems = items.filter((entry) => (!accountId || entry.accountId === accountId) && (activeTab === 'all' || (activeTab === 'balls' ? entry.category === 'ball' : entry.category === 'item')))
    if (activeTab === 'pokemon') return accountPokemon
    if (activeTab === 'balls' || activeTab === 'items') return accountItems.length
    return accountPokemon + accountItems.length
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><img src="./icons/logo.png" alt="" /></div><div className="brand-copy"><strong>PokeCentral</strong><span>Desktop</span></div><button className="sidebar-toggle" onClick={() => setSidebarCollapsed((current) => !current)} aria-label={sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'} aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}>{sidebarCollapsed ? '›' : '‹'}</button></div>
        <nav>
          <button title="Telas" className={`nav-item ${activeView === 'launcher' ? 'active' : ''}`} onClick={() => setActiveView('launcher')}><img src="./icons/telas.png" alt="" /><span>Telas</span></button>
          <button title="Inventário" className={`nav-item ${activeView === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveView('dashboard')}><img src="./icons/mochila.png" alt="" /><span>Inventário</span></button>
          <button title="Laboratório" className={`nav-item ${activeView === 'lab' ? 'active' : ''}`} onClick={() => setActiveView('lab')}><img src="./icons/lab.png" alt="" /><span>Laboratório</span></button>
          <button title="Hunts" className={`nav-item ${activeView === 'hunts' ? 'active' : ''}`} onClick={() => setActiveView('hunts')}><b className="hunt-nav-icon">⚔</b><span>Hunts</span></button>
          <button title="Mercado" className={`nav-item ${activeView === 'market' ? 'active' : ''}`} onClick={() => setActiveView('market')}><b className="hunt-nav-icon">↕</b><span>Mercado</span></button>
          <button title="Vitrine" className={`nav-item ${activeView === 'showcase' ? 'active' : ''}`} onClick={() => setActiveView('showcase')}><img src="./icons/vitrine.png" alt="" /><span>Vitrine</span></button>
        </nav>
        <button className="accounts-manage-trigger" onClick={() => setAccountsManagerOpen(true)} title="Configurações"><span>⚙</span><b>Configurações</b><small>{accounts.length}/4</small></button>      </aside>

      <main className={activeView === 'launcher' ? 'launcher-main' : ''}>
        <LauncherPanel accounts={accounts} items={items} huntSessions={huntSessions} initialSlot={selectedSlot} active={activeView === 'launcher'} accountOpenRequest={accountOpenRequest} gridOpenRequest={gridOpenRequest} accountsManagerOpen={accountsManagerOpen} onCloseAccountsManager={() => setAccountsManagerOpen(false)} onAddAccount={addAccount} onRemoveAccount={removeAccount} settings={settings} onSettingsChange={setSettings} onOpenAccount={(slot) => {
          const account = accounts.find((entry) => entry.slot === slot)
          if (account) setSelectedAccountId(account.id)
          setLauncherMode('single')
          setActiveView('launcher')
        }} onShowGrid={() => {
          setLauncherMode('grid')
          setActiveView('launcher')
        }} />

        <div className={`dashboard-view inventory-dashboard ${activeView === 'dashboard' ? 'active' : 'inactive'}`}>
          <header className="inventory-header"><span className="system-label">DSK-01 // CENTRAL DE INVENTÁRIO</span><span className="system-lights" aria-hidden="true">● ● ●</span><div><p className="eyebrow">INVENTÁRIO SINCRONIZADO</p><h1>Tudo que está nas suas contas.</h1><p className="subtitle">Pokémon, Pokébolas e itens organizados em uma única central.</p></div></header>

          <section className="inventory inventory-focused">
            <div className="inventory-account-filter" aria-label="Filtrar inventário por conta">
              <span>EXIBIR CONTA</span>
              <div>
                <button className={accountFilter === 'all' ? 'active' : ''} onClick={() => setAccountFilter('all')}><strong>Todas as contas</strong><b>{inventoryCountFor()}</b></button>
                {accounts.map((account) => <button key={account.id} className={`account-scope-${account.slot} ${accountFilter === account.id ? 'active' : ''}`} onClick={() => setAccountFilter(account.id)}><strong>Conta {account.slot}</strong><small>{account.characterName ?? 'Sem personagem'}</small><b>{inventoryCountFor(account.id)}</b></button>)}
              </div>
            </div>

            <div className="inventory-tabs" role="tablist">
              <button className={activeTab === 'all' ? 'active' : ''} onClick={() => setActiveTab('all')}>Tudo <b>{pokemon.length + items.length}</b></button>
              <button className={activeTab === 'pokemon' ? 'active' : ''} onClick={() => setActiveTab('pokemon')}>Pokémon <b>{pokemon.length}</b></button>
              <button className={activeTab === 'balls' ? 'active' : ''} onClick={() => setActiveTab('balls')}>Pokébolas <b>{ballCount}</b></button>
              <button className={activeTab === 'items' ? 'active' : ''} onClick={() => setActiveTab('items')}>Itens <b>{itemCount}</b></button>
            </div>

            <div className="section-title inventory-title"><div><p className="eyebrow">{activeTab === 'all' ? 'VISÃO GERAL' : activeTab.toUpperCase()}</p><h2>{showPokemon ? `${filteredPokemon.length} Pokémon` : `${filteredItems.length} tipos encontrados`}</h2></div><input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar no inventário" /></div>

            <div className={`inventory-filters ${showPokemon ? '' : 'item-filters'}`}>
              {showPokemon && <>
                <label>LV mínimo<input type="number" min="0" value={levelMin} onChange={(event) => setLevelMin(event.target.value)} placeholder="0" /></label><label>LV máximo<input type="number" min="0" value={levelMax} onChange={(event) => setLevelMax(event.target.value)} placeholder="Sem limite" /></label>
                <label>IV mínimo<input type="number" min="0" max="192" value={ivMin} onChange={(event) => setIvMin(event.target.value)} placeholder="0" /></label>
                <label>IV máximo<input type="number" min="0" max="192" value={ivMax} onChange={(event) => setIvMax(event.target.value)} placeholder="192" /></label>
                <label>Quality mínima<input type="number" min="0" step="0.001" value={qualityMin} onChange={(event) => setQualityMin(event.target.value)} placeholder="0.000" /></label>
                <label>Quality máxima<input type="number" min="0" step="0.001" value={qualityMax} onChange={(event) => setQualityMax(event.target.value)} placeholder="2.000" /></label>
                <button className={`shiny-toggle ${shinyOnly ? 'active' : ''}`} onClick={() => setShinyOnly((current) => !current)} aria-pressed={shinyOnly}><span>✦</span> SHINY</button>
              </>}
              <button className="clear-filters" onClick={clearFilters}>LIMPAR</button>
            </div>

            {showPokemon && <div className="rarity-filter"><span>RARIDADE</span><div>{qualityTierOptions.map((tier) => <button key={tier.key} className={selectedRarities.includes(tier.key) ? 'active' : ''} style={{ '--tier-color': tier.color } as React.CSSProperties} onClick={() => toggleRarity(tier.key)} aria-pressed={selectedRarities.includes(tier.key)}>{tier.name}</button>)}</div><small>{selectedRarities.length ? `${selectedRarities.length} selecionada(s)` : 'Todas'}</small></div>}

            <div className={`inventory-results ${activeTab === 'all' ? 'combined' : ''}`}>
              {showPokemon && <InventoryPokemonTable accounts={accounts} entries={filteredPokemon} listings={listings} sortColumn={sortColumn} sortDirection={sortDirection} onSort={sortPokemonBy} onAdvertise={setListingPokemonId} onAnalyze={(pokemonId) => { setLabPokemonId(pokemonId); setLabRequestVersion((current) => current + 1); setActiveView('lab') }} />}
              {showItems && <InventoryItemTable accounts={accounts} entries={filteredItems} emptyMessage={activeTab === 'balls' ? 'Abra a área de Pokébolas no jogo para sincronizar.' : 'Abra a mochila ou os suprimentos no jogo para sincronizar os itens.'} />}
            </div>
          </section>
          <div className="sync-message" role="status">{message}</div>
        </div>

        <div className={`dashboard-view ${activeView === 'lab' ? 'active' : 'inactive'}`}><LabPanel accounts={accounts} pokemon={pokemon} requestedPokemonId={labPokemonId} requestVersion={labRequestVersion} /></div>
        <div className={`dashboard-view ${activeView === 'hunts' ? 'active' : 'inactive'}`}><HuntPanel accounts={accounts} pokemon={pokemon} sessions={huntSessions} preferences={settings} /></div>
        <div className={`dashboard-view ${activeView === 'market' ? 'active' : 'inactive'}`}><MarketPanel listings={marketListings} /></div>
        <div className={`dashboard-view ${activeView === 'showcase' ? 'active' : 'inactive'}`}><ShowcasePanel accounts={accounts} listings={listings} pokemon={pokemon} onEdit={(listing) => setListingPokemonId(listing.pokemonId)} onArchive={archiveListing} onSold={markListingSold} onRestore={restoreListing} onDelete={deleteListing} onAcceptPriceReview={(listingId, price) => {
          const now = new Date().toISOString()
          setListings((current) => current.map((entry) => entry.id === listingId ? { ...entry, price, priceUpdatedAt: now, priceReviewDismissedAt: undefined, updatedAt: now } : entry))
          setMessage('Novo preço aplicado somente à sua Vitrine local.')
        }} onDismissPriceReview={(listingId) => {
          const now = new Date().toISOString()
          setListings((current) => current.map((entry) => entry.id === listingId ? { ...entry, priceReviewDismissedAt: now } : entry))
        }} onGoInventory={() => setActiveView('dashboard')} /></div>
      </main>
      {listingPokemonId && (() => {
        const selectedPokemon = pokemon.find((entry) => entry.id === listingPokemonId)
      ?? listings.find((entry) => entry.pokemonId === listingPokemonId)?.pokemon
        if (!selectedPokemon) return null
        return <ListingEditor account={accounts.find((entry) => entry.id === selectedPokemon.accountId)} pokemon={selectedPokemon} listing={listings.find((entry) => entry.pokemonId === selectedPokemon.id)} onClose={() => setListingPokemonId(null)} onSave={saveListing} />
      })()}
    </div>
  )
}

function SortableHeader({ column, label, activeColumn, direction, onSort }: { column: SortColumn; label: string; activeColumn: SortColumn; direction: SortDirection; onSort: (column: SortColumn) => void }): React.JSX.Element {
  const active = activeColumn === column
  return <th aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className={`sortable-header ${active ? 'active' : ''}`} onClick={() => onSort(column)} title={`Ordenar por ${label}`}>{label}<span aria-hidden="true">{active ? (direction === 'asc' ? '▲' : '▼') : '↕'}</span></button></th>
}

function InventoryPokemonTable({ accounts, entries, listings, sortColumn, sortDirection, onSort, onAdvertise, onAnalyze }: { accounts: Account[]; entries: Pokemon[]; listings: LocalListing[]; sortColumn: SortColumn; sortDirection: SortDirection; onSort: (column: SortColumn) => void; onAdvertise: (pokemonId: string) => void; onAnalyze: (pokemonId: string) => void }): React.JSX.Element {
  if (!entries.length) return <div className="empty"><div className="empty-ball">◓</div><h3>Nenhum Pokémon encontrado</h3><p>Ajuste os filtros ou abra a box no jogo.</p></div>
  return <div className="inventory-section"><div className="inventory-section-heading"><h2>Pokémon</h2><span className="sort-help">↕ Clique nos títulos para ordenar · {entries.length} registros</span></div><div className="table-wrap"><table><thead><tr><SortableHeader column="account" label="Conta" activeColumn={sortColumn} direction={sortDirection} onSort={onSort} /><SortableHeader column="species" label="Pokémon" activeColumn={sortColumn} direction={sortDirection} onSort={onSort} /><SortableHeader column="level" label="Nível" activeColumn={sortColumn} direction={sortDirection} onSort={onSort} /><SortableHeader column="iv" label="IV total" activeColumn={sortColumn} direction={sortDirection} onSort={onSort} /><SortableHeader column="quality" label="Quality" activeColumn={sortColumn} direction={sortDirection} onSort={onSort} /><SortableHeader column="rarity" label="Raridade" activeColumn={sortColumn} direction={sortDirection} onSort={onSort} /><SortableHeader column="potential" label="Potencial" activeColumn={sortColumn} direction={sortDirection} onSort={onSort} /><SortableHeader column="power" label="Power atual" activeColumn={sortColumn} direction={sortDirection} onSort={onSort} /><th>Ação</th></tr></thead><tbody>{entries.map((entry) => {
    const account = accounts.find((item) => item.id === entry.accountId)
    const tier = qualityTier(entry.quality)
    const potential = analyzePokemon(entry)
    const advertised = listings.some((listing) => listing.pokemonId === entry.id && (listing.status ?? 'active') === 'active')
    return <tr key={entry.id}><td><span className={`account-cell account-bg-${account?.slot ?? 1}`}>C{account?.slot ?? '—'}</span></td><td><div className="inventory-identity"><InventoryImage src={pokemonSpriteUrl(entry.speciesId ?? creatureFor(entry)?.id, entry.shiny)} alt={entry.species} className="pokemon-sprite" /><span><strong>{entry.species}</strong>{entry.shiny && <span className="shiny">Shiny</span>}</span></div></td><td>{entry.level ?? '—'}</td><td>{entry.iv ?? '—'}</td><td>{entry.quality ?? '—'}</td><td>{tier ? <span className={`quality-badge quality-${tier.key}`} style={{ borderColor: tier.color, color: tier.color }}>{tier.name}</span> : '—'}</td><td><span className={`potential-badge potential-${potential.tone}`} title="Potencial combina Quality e IV; não representa o nível atual.">{potential.label}<small>{potential.score === null ? '—' : `${Math.round(potential.score * 100)}/100`}</small></span></td><td><span className="power-value" title="Power atual calculado com os seis stats e a Quality">{potential.power?.toLocaleString('pt-BR') ?? '—'}</span></td><td><div className="inventory-row-actions"><button className="analyze-button" onClick={() => onAnalyze(entry.id)}>Analisar</button><button className={`advertise-button ${advertised ? 'active' : ''}`} onClick={() => onAdvertise(entry.id)}>{advertised ? 'Na vitrine' : 'Anunciar'}</button></div></td></tr>
  })}</tbody></table></div></div>
}

function InventoryItemTable({ accounts, entries, emptyMessage }: { accounts: Account[]; entries: InventoryItem[]; emptyMessage: string }): React.JSX.Element {
  if (!entries.length) return <div className="empty item-empty"><h3>Nenhum item sincronizado</h3><p>{emptyMessage}</p></div>
  return <div className="inventory-section"><div className="inventory-section-heading"><h2>Pokébolas e itens</h2><span>{entries.length} tipos</span></div><div className="table-wrap"><table><thead><tr><th>Conta</th><th>Item</th><th>Categoria</th><th>Quantidade</th><th>Valor NPC</th></tr></thead><tbody>{entries.map((entry) => {
    const account = accounts.find((item) => item.id === entry.accountId)
    return <tr key={entry.id}><td><span className={`account-cell account-bg-${account?.slot ?? 1}`}>C{account?.slot ?? '—'}</span></td><td><div className="inventory-identity"><InventoryImage src={itemImageUrl(entry.icon, entry.name)} alt={entry.name} className="item-sprite" /><strong>{entry.name}</strong></div></td><td><span className={`item-category ${entry.category}`}>{entry.category === 'ball' ? 'Pokébola' : entry.gameCategory ?? 'Item'}</span></td><td>{entry.quantity.toLocaleString('pt-BR')}</td><td>{entry.npcPrice === undefined ? '—' : entry.npcPrice.toLocaleString('pt-BR')}</td></tr>
  })}</tbody></table></div></div>
}
