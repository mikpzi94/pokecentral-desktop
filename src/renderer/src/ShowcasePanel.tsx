import { useMemo, useState } from 'react'
import type { Account, LocalListing, Pokemon, SellerProfile } from '../../shared/types'
import InventoryImage, { pokemonSpriteUrl } from './InventoryImage'
import { analyzePokemon, calculatedPower, qualityTier } from './lib/pokemon-analysis'
import { suggestPokemonPrice } from './lib/pricing'

type ShowcaseProps = {
  accounts: Account[]
  listings: LocalListing[]
  pokemon: Pokemon[]
  onEdit: (listing: LocalListing) => void
  onArchive: (listingId: string) => void
  onSold: (listingId: string) => void
  onRestore: (listingId: string) => void
  onDelete: (listingId: string) => void
  onAcceptPriceReview: (listingId: string, price: number) => void
  onDismissPriceReview: (listingId: string) => void
  onGoInventory: () => void
}

type EditorProps = {
  account?: Account
  pokemon: Pokemon
  listing?: LocalListing
  onClose: () => void
  onSave: (price: number, negotiable: boolean) => void
}

type ShowcaseTab = 'active' | 'removed'
type ShowcaseSort = 'recent' | 'iv-desc' | 'quality-desc' | 'price-desc' | 'price-asc'

const PROFILE_KEY = 'pokecentral.showcase.profile.v1'
const SHOWCASE_NAME_KEY = 'pokecentral.showcase.name.v1'
const PUBLIC_SHARE_BASE = 'https://pokecentral-rmt.vercel.app/s/'
const emptyProfile: SellerProfile = { whatsapp: '', discordUsername: '', discordUserId: '', preferredContact: 'whatsapp' }

function loadProfile(): SellerProfile {
  try {
    const saved = localStorage.getItem(PROFILE_KEY)
    return saved ? { ...emptyProfile, ...JSON.parse(saved) as SellerProfile } : emptyProfile
  } catch { return emptyProfile }
}

function money(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function numeric(value: string | number | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function listingCode(listing: LocalListing): string {
  return listing.publicCode ?? 'AC?-000'
}

function priceReviewFor(listing: LocalListing): { days: number; price: number } | null {
  const timestamps = [listing.createdAt, listing.priceUpdatedAt, listing.priceReviewDismissedAt]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite)
  const reference = timestamps.length ? Math.max(...timestamps) : Date.now()
  const days = Math.floor(Math.max(0, Date.now() - reference) / 86_400_000)
  if (days < 5) return null
  const quick = suggestPokemonPrice(listing.pokemon).quick
  const faster = Math.max(0.5, Math.round(Math.min(quick, listing.price * 0.9) * 2) / 2)
  return faster < listing.price ? { days, price: faster } : null
}
function sanitizePhone(value: string): string {
  return value.replace(/\D/g, '')
}

function encodePayload(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function ListingEditor({ account, pokemon, listing, onClose, onSave }: EditorProps): React.JSX.Element {
  const suggestion = useMemo(() => suggestPokemonPrice(pokemon), [pokemon])
  const [price, setPrice] = useState(String(listing?.price ?? suggestion.recommended))
  const [negotiable, setNegotiable] = useState(listing?.negotiable ?? false)
  const [error, setError] = useState('')
  const tier = qualityTier(pokemon.quality)
  const potential = analyzePokemon(pokemon)

  function submit(): void {
    const value = Number(price.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) {
      setError('Informe um preço maior que zero.')
      return
    }
    onSave(Math.round(value * 100) / 100, negotiable)
  }

  return (
    <div className="listing-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="listing-modal" role="dialog" aria-modal="true" aria-labelledby="listing-editor-title">
        <div className="listing-modal-heading">
          <div><p className="eyebrow">VITRINE LOCAL</p><h2 id="listing-editor-title">{listing ? 'Editar anúncio' : 'Criar anúncio'}</h2></div>
          <button className="listing-close" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <div className="listing-pokemon-summary">
          <InventoryImage src={pokemonSpriteUrl(pokemon.speciesId, pokemon.shiny)} alt={pokemon.species} className="listing-pokemon-image" />
          <div><strong>{pokemon.species}</strong><span>Conta {account?.slot ?? '—'} · {account?.characterName ?? 'Sem personagem'}</span></div>
          <div className="listing-auto-data">
            <span>LV <b>{pokemon.level ?? '—'}</b></span><span>IV <b>{pokemon.iv ?? '—'}</b></span><span>Quality <b>{pokemon.quality ?? '—'}</b></span>
            <span>Raridade <b style={{ color: tier?.color }}>{tier?.name ?? '—'}</b></span><span>Potencial <b>{potential.label}</b></span>{pokemon.shiny && <span className="listing-shiny">✦ SHINY</span>}
          </div>
        </div>
        <div className="price-suggestion">
          <div><p className="eyebrow">CALCULADORA DO POKECENTRAL</p><h3>Escolha uma referência ou defina seu preço.</h3></div>
          <div className="price-options">
            <button onClick={() => setPrice(String(suggestion.quick))}><span>Venda rápida</span><strong>{money(suggestion.quick)}</strong><small>mais chance de vender logo</small></button>
            <button className="recommended" onClick={() => setPrice(String(suggestion.recommended))}><span>Recomendado</span><strong>{money(suggestion.recommended)}</strong><small>referência equilibrada</small></button>
            <button onClick={() => setPrice(String(suggestion.flexible))}><span>Preço flexível</span><strong>{money(suggestion.flexible)}</strong><small>margem para negociar</small></button>
          </div>
          <p className="pricing-note">Estimativa local baseada em espécie, IV, Quality, nível e shiny. O valor final continua sendo sua decisão.</p>
        </div>
        <div className="listing-fields">
          <label>Seu preço (R$)<input autoFocus type="number" min="0.5" step="0.5" value={price} onChange={(event) => { setPrice(event.target.value); setError('') }} /></label>
          <button className={`negotiable-toggle ${negotiable ? 'active' : ''}`} onClick={() => setNegotiable((current) => !current)} aria-pressed={negotiable}>
            <span>{negotiable ? '✓' : '○'}</span><strong>Aceito negociar</strong><small>{negotiable ? 'Compradores podem fazer propostas.' : 'Preço fixo, sem propostas.'}</small>
          </button>
        </div>
        {error && <p className="listing-error">{error}</p>}
        <div className="listing-modal-actions"><button className="ghost" onClick={onClose}>Cancelar</button><button className="primary" onClick={submit}>{listing ? 'Salvar alterações' : 'Adicionar à vitrine'}</button></div>
      </section>
    </div>
  )
}

function shareText(listing: LocalListing): string {
  const pokemon = listing.pokemon
  const tier = qualityTier(pokemon.quality)
  const potential = analyzePokemon(pokemon)
  return [
    `⚡ ${pokemon.species}${pokemon.shiny ? ' ✦ SHINY' : ''} à venda`,
    `Código do anúncio: ${listingCode(listing)}`,
    `LV ${pokemon.level ?? '—'} · IV ${pokemon.iv ?? '—'} · Quality ${pokemon.quality ?? '—'} · ${tier?.name ?? 'Sem raridade'}`,
    `Potencial: ${potential.label} · ${potential.confidenceLabel} · Power: ${calculatedPower(pokemon)?.toLocaleString('pt-BR') ?? '—'}`,
    `Preço: ${money(listing.price)}${listing.negotiable ? ' · Aceita propostas' : ' · Preço fixo'}`,
    '', 'Anúncio criado no PokeCentral Desktop.'
  ].join('\n')
}

async function loadArtwork(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    const timer = window.setTimeout(() => resolve(null), 3500)
    image.crossOrigin = 'anonymous'
    image.onload = () => { window.clearTimeout(timer); resolve(image) }
    image.onerror = () => { window.clearTimeout(timer); resolve(null) }
    image.src = url
  })
}

function statEntries(pokemon: Pokemon): Array<[string, number | undefined]> {
  return [
    ['HP', pokemon.stats?.hp], ['ATK', pokemon.stats?.attack], ['DEF', pokemon.stats?.defense],
    ['SP. ATK', pokemon.stats?.specialAttack], ['SP. DEF', pokemon.stats?.specialDefense], ['SPEED', pokemon.stats?.speed]
  ]
}

async function shareCard(listing: LocalListing): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 630
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Não foi possível criar o cartão.')
  const pokemon = listing.pokemon
  const tier = qualityTier(pokemon.quality)
  const potential = analyzePokemon(pokemon)
  const gradient = context.createLinearGradient(0, 0, 1200, 630)
  gradient.addColorStop(0, '#120f0a')
  gradient.addColorStop(1, '#292015')
  context.fillStyle = gradient
  context.fillRect(0, 0, 1200, 630)
  context.strokeStyle = '#f0b429'
  context.lineWidth = 8
  context.strokeRect(22, 22, 1156, 586)
  context.fillStyle = '#f0b429'
  context.font = '700 22px "IBM Plex Mono", monospace'
  context.fillText('POKECENTRAL  //  VITRINE', 56, 70)

  const artworkUrl = pokemonSpriteUrl(pokemon.speciesId, pokemon.shiny)
  const artwork = artworkUrl ? await loadArtwork(artworkUrl) : null
  if (artwork) {
    context.imageSmoothingEnabled = false
    context.drawImage(artwork, 52, 120, 330, 330)
    context.imageSmoothingEnabled = true
  }

  context.fillStyle = '#f2e8d5'
  context.font = '700 46px "IBM Plex Mono", monospace'
  context.fillText(pokemon.species, 410, 128)
  context.fillStyle = tier?.color ?? '#a89880'
  context.font = '600 21px "IBM Plex Mono", monospace'
  context.fillText(`${tier?.name ?? 'Sem raridade'}${pokemon.shiny ? '  ·  SHINY' : ''}`, 414, 166)

  const drawMetric = (x: number, label: string, value: string, color: string): void => {
    context.fillStyle = 'rgba(8, 7, 5, .52)'
    context.strokeStyle = '#59462c'
    context.lineWidth = 2
    context.beginPath()
    context.roundRect(x, 188, 222, 68, 4)
    context.fill()
    context.stroke()
    context.fillStyle = color
    context.fillRect(x, 188, 222, 4)
    context.fillStyle = '#8f806b'
    context.font = '700 13px "IBM Plex Mono", monospace'
    context.fillText(label, x + 14, 213)
    context.fillStyle = '#f2e8d5'
    context.font = '700 25px "IBM Plex Mono", monospace'
    context.fillText(value, x + 14, 244)
  }
  drawMetric(414, 'NÍVEL', pokemon.level?.toLocaleString('pt-BR') ?? '—', '#f0b429')
  drawMetric(650, 'IV TOTAL', pokemon.iv?.toLocaleString('pt-BR') ?? '—', '#8fc45a')
  drawMetric(886, 'QUALITY', pokemon.quality?.toString() ?? '—', tier?.color ?? '#58a6d9')

  const stats = statEntries(pokemon)
  const maximumStat = Math.max(1, ...stats.map(([, value]) => value ?? 0))
  stats.forEach(([label, value], index) => {
    const column = Math.floor(index / 3)
    const row = index % 3
    const x = 414 + column * 356
    const y = 286 + row * 43
    const trackX = x + 78
    const trackWidth = 190
    context.fillStyle = '#a89880'
    context.font = '600 13px "IBM Plex Mono", monospace'
    context.fillText(label, x, y + 16)
    context.fillStyle = '#090704'
    context.strokeStyle = '#59462c'
    context.lineWidth = 1
    context.fillRect(trackX, y + 7, trackWidth, 11)
    context.strokeRect(trackX, y + 7, trackWidth, 11)
    if (value !== undefined) {
      const statGradient = context.createLinearGradient(trackX, 0, trackX + trackWidth, 0)
      statGradient.addColorStop(0, '#8fc45a')
      statGradient.addColorStop(1, '#f0b429')
      context.fillStyle = statGradient
      context.fillRect(trackX + 1, y + 8, Math.max(2, (trackWidth - 2) * value / maximumStat), 9)
    }
    context.fillStyle = '#f2e8d5'
    context.font = '700 16px "IBM Plex Mono", monospace'
    context.textAlign = 'right'
    context.fillText(value?.toLocaleString('pt-BR') ?? '—', x + 338, y + 17)
    context.textAlign = 'left'
  })

  context.fillStyle = '#c7b79f'
  context.font = '600 18px "IBM Plex Mono", monospace'
  context.fillText(`POTENCIAL: ${potential.label}`, 414, 438)
  context.fillText(`POWER: ${calculatedPower(pokemon)?.toLocaleString('pt-BR') ?? '—'}`, 790, 438)
  const confidenceColor = potential.confidence === 'high' ? '#8fc45a' : potential.confidence === 'preliminary' ? '#f0b429' : '#d4593f'
  context.fillStyle = confidenceColor
  context.font = '700 14px "IBM Plex Mono", monospace'
  context.fillText(`CONFIANÇA: ${potential.confidenceLabel.toUpperCase()}`, 414, 466)

  context.fillStyle = '#f0b429'
  context.font = '700 42px "IBM Plex Mono", monospace'
  context.fillText(money(listing.price), 414, 518)
  context.fillStyle = listing.negotiable ? '#8fc45a' : '#a89880'
  context.font = '600 18px "IBM Plex Mono", monospace'
  context.fillText(listing.negotiable ? 'ACEITA PROPOSTAS' : 'PREÇO FIXO', 418, 550)
  context.fillStyle = '#c7b79f'
  context.font = '500 18px "IBM Plex Mono", monospace'
  context.fillText(`CÓDIGO: ${listingCode(listing)}`, 56, 530)
  context.fillStyle = '#736450'
  context.font = '500 16px "IBM Plex Mono", monospace'
  context.fillText('Use este código para localizar o anúncio na Vitrine', 56, 574)
  return canvas.toDataURL('image/png')
}

async function catalogCardPage(entries: LocalListing[], showcaseName: string, page: number, totalPages: number): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 1350
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas indisponível')
  const gradient = context.createLinearGradient(0, 0, 1200, 1350)
  gradient.addColorStop(0, '#15110b'); gradient.addColorStop(1, '#080705')
  context.fillStyle = gradient; context.fillRect(0, 0, 1200, 1350)
  context.strokeStyle = '#f0b429'; context.lineWidth = 8; context.strokeRect(20, 20, 1160, 1310)
  context.fillStyle = '#f0b429'; context.font = '700 24px "IBM Plex Mono", monospace'; context.fillText('POKECENTRAL  //  VITRINE', 58, 72)
  context.fillStyle = '#f2e8d5'; context.font = '700 46px "IBM Plex Mono", monospace'; context.fillText(showcaseName.trim() || 'Pokémon disponíveis', 58, 130)
  context.fillStyle = '#a89880'; context.font = '500 18px "IBM Plex Mono", monospace'; context.fillText(`Página ${page + 1} de ${totalPages} · Informe o código ao vendedor`, 60, 166)
  for (let index = 0; index < entries.length; index += 1) {
    const listing = entries[index]
    const col = index % 2
    const row = Math.floor(index / 2)
    const x = 55 + col * 555
    const y = 205 + row * 365
    const tier = qualityTier(listing.pokemon.quality)
    context.fillStyle = '#1d1811'; context.strokeStyle = tier?.color ?? '#59462c'; context.lineWidth = 3
    context.fillRect(x, y, 535, 330); context.strokeRect(x, y, 535, 330)
    const spriteUrl = pokemonSpriteUrl(listing.pokemon.speciesId, listing.pokemon.shiny)
    const art = spriteUrl ? await loadArtwork(spriteUrl) : null
    if (art) context.drawImage(art, x + 24, y + 52, 150, 150)
    context.fillStyle = '#f2e8d5'; context.font = '700 27px "IBM Plex Mono", monospace'; context.fillText(listing.pokemon.species, x + 190, y + 62, 320)
    context.fillStyle = tier?.color ?? '#c7b79f'; context.font = '700 17px "IBM Plex Mono", monospace'; context.fillText(`${tier?.name ?? 'Sem raridade'}${listing.pokemon.shiny ? ' · SHINY' : ''}`, x + 190, y + 94)
    context.fillStyle = '#c7b79f'; context.font = '600 18px "IBM Plex Mono", monospace'; context.fillText(`LV ${listing.pokemon.level ?? '—'}   IV ${listing.pokemon.iv ?? '—'}`, x + 190, y + 138)
    context.fillText(`QUALITY ${listing.pokemon.quality ?? '—'}`, x + 190, y + 172)
    context.fillStyle = '#f0b429'; context.font = '700 31px "IBM Plex Mono", monospace'; context.fillText(money(listing.price), x + 190, y + 224)
    context.fillStyle = listing.negotiable ? '#8fc45a' : '#a89880'; context.font = '600 14px "IBM Plex Mono", monospace'; context.fillText(listing.negotiable ? 'ACEITA PROPOSTAS' : 'PREÇO FIXO', x + 192, y + 254)
    context.fillStyle = '#0a0805'; context.fillRect(x + 22, y + 278, 491, 34)
    context.fillStyle = '#f0b429'; context.font = '700 20px "IBM Plex Mono", monospace'; context.fillText(`CÓDIGO ${listingCode(listing)}`, x + 36, y + 302)
  }
  return canvas.toDataURL('image/png')
}
function publicLink(listing: LocalListing, profile: SellerProfile, destination: 'whatsapp' | 'discord'): string {
  const pokemon = listing.pokemon
  const tier = qualityTier(pokemon.quality)
  const potential = analyzePokemon(pokemon)
  const payload = {
    v: 1, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, destination, species: pokemon.species, speciesId: pokemon.speciesId, shiny: pokemon.shiny,
    level: pokemon.level, iv: pokemon.iv, quality: pokemon.quality, rarity: tier?.name,
    potential: potential.label, confidence: potential.confidenceLabel, power: calculatedPower(pokemon), stats: pokemon.stats,
    price: listing.price, negotiable: listing.negotiable, listingCode: listingCode(listing),
    contact: destination === 'whatsapp' ? sanitizePhone(profile.whatsapp) : profile.discordUserId,
    discordUsername: destination === 'discord' ? profile.discordUsername : undefined
  }
  return `${PUBLIC_SHARE_BASE}${encodePayload(payload)}`
}

export default function ShowcasePanel({ accounts, listings, pokemon, onEdit, onArchive, onSold, onRestore, onDelete, onAcceptPriceReview, onDismissPriceReview, onGoInventory }: ShowcaseProps): React.JSX.Element {
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<ShowcaseTab>('active')
  const [query, setQuery] = useState('')
  const [accountFilter, setAccountFilter] = useState('all')
  const [ivMin, setIvMin] = useState('')
  const [ivMax, setIvMax] = useState('')
  const [qualityMin, setQualityMin] = useState('')
  const [qualityMax, setQualityMax] = useState('')
  const [shinyOnly, setShinyOnly] = useState(false)
  const [sort, setSort] = useState<ShowcaseSort>('recent')
  const [profile, setProfile] = useState<SellerProfile>(loadProfile)
  const [profileOpen, setProfileOpen] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showcaseName, setShowcaseName] = useState(() => localStorage.getItem(SHOWCASE_NAME_KEY) ?? '')
  const [catalogPages, setCatalogPages] = useState<string[]>([])
  const [catalogPage, setCatalogPage] = useState(0)
  const [catalogBusy, setCatalogBusy] = useState(false)

  const activeCount = listings.filter((entry) => (entry.status ?? 'active') === 'active').length
  const removedCount = listings.length - activeCount
  const filtered = useMemo(() => {
    const minIv = ivMin === '' ? undefined : Number(ivMin)
    const maxIv = ivMax === '' ? undefined : Number(ivMax)
    const minQuality = qualityMin === '' ? undefined : Number(qualityMin.replace(',', '.'))
    const maxQuality = qualityMax === '' ? undefined : Number(qualityMax.replace(',', '.'))
    const term = query.trim().toLocaleLowerCase('pt-BR')
    return listings.filter((listing) => {
      const active = (listing.status ?? 'active') === 'active'
      if ((tab === 'active') !== active) return false
      if (accountFilter !== 'all' && listing.accountId !== accountFilter) return false
      if (term && !listing.pokemon.species.toLocaleLowerCase('pt-BR').includes(term) && !listingCode(listing).toLocaleLowerCase('pt-BR').includes(term)) return false
      if (minIv !== undefined && numeric(listing.pokemon.iv) < minIv) return false
      if (maxIv !== undefined && numeric(listing.pokemon.iv) > maxIv) return false
      if (minQuality !== undefined && numeric(listing.pokemon.quality) < minQuality) return false
      if (maxQuality !== undefined && numeric(listing.pokemon.quality) > maxQuality) return false
      if (shinyOnly && !listing.pokemon.shiny) return false
      return true
    }).sort((left, right) => {
      if (sort === 'iv-desc') return numeric(right.pokemon.iv) - numeric(left.pokemon.iv)
      if (sort === 'quality-desc') return numeric(right.pokemon.quality) - numeric(left.pokemon.quality)
      if (sort === 'price-desc') return right.price - left.price
      if (sort === 'price-asc') return left.price - right.price
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    })
  }, [accountFilter, ivMax, ivMin, listings, qualityMax, qualityMin, query, shinyOnly, sort, tab])

  function saveProfile(next: SellerProfile): void {
    setProfile(next); localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); setNotice('Dados de contato salvos somente neste computador.')
  }

  async function copyImage(listing: LocalListing): Promise<void> {
    const text = shareText(listing)
    try {
      const imageDataUrl = await shareCard(listing)
      await window.pokecentral.copyShareCard({ text, imageDataUrl })
      setNotice('Imagem detalhada e texto copiados. Agora é só colar no grupo.')
    } catch { await window.pokecentral.copyShareCard({ text }); setNotice('Não foi possível copiar a imagem; o texto foi copiado.') }
  }

  async function generateLink(listing: LocalListing, destination: 'whatsapp' | 'discord'): Promise<void> {
    if (destination === 'whatsapp' && sanitizePhone(profile.whatsapp).length < 10) { setProfileOpen(true); setNotice('Cadastre um WhatsApp com DDD antes de gerar o link.'); return }
    if (destination === 'discord' && !/^\d{17,20}$/.test(profile.discordUserId.trim())) { setProfileOpen(true); setNotice('Informe o ID numérico do Discord para que o link abra o perfil correto.'); return }
    const link = publicLink(listing, profile, destination)
    await window.pokecentral.copyShareCard({ text: `${shareText(listing)}\n\n${link}` })
    setNotice(`Link para ${destination === 'whatsapp' ? 'WhatsApp' : 'Discord'} copiado. Os dados deste card só foram incluídos porque você gerou o link.`)
  }

  function toggleSelection(listingId: string): void {
    setSelectedIds((current) => current.includes(listingId) ? current.filter((id) => id !== listingId) : [...current, listingId])
  }

  function closeSelection(): void {
    setSelectionMode(false); setSelectedIds([])
  }

  async function generateCatalog(): Promise<void> {
    const selected = listings.filter((listing) => selectedIds.includes(listing.id) && (listing.status ?? 'active') === 'active')
    if (!selected.length) { setNotice('Selecione pelo menos um anúncio ativo.'); return }
    setCatalogBusy(true)
    try {
      localStorage.setItem(SHOWCASE_NAME_KEY, showcaseName)
      const chunks: LocalListing[][] = []
      for (let index = 0; index < selected.length; index += 6) chunks.push(selected.slice(index, index + 6))
      const pages: string[] = []
      for (let index = 0; index < chunks.length; index += 1) pages.push(await catalogCardPage(chunks[index], showcaseName, index, chunks.length))
      setCatalogPages(pages); setCatalogPage(0); setNotice(`${selected.length} anúncio(s) organizados em ${pages.length} imagem(ns).`)
    } catch { setNotice('Não foi possível gerar as imagens da vitrine.') }
    finally { setCatalogBusy(false) }
  }

  async function copyCatalog(): Promise<void> {
    const imageDataUrl = catalogPages[catalogPage]
    if (!imageDataUrl) return
    await window.pokecentral.copyShareCard({ text: `${showcaseName.trim() || 'Pokémon disponíveis'} · página ${catalogPage + 1}/${catalogPages.length}`, imageDataUrl })
    setNotice(`Imagem ${catalogPage + 1} copiada. Agora é só colar no grupo.`)
  }
  function clearFilters(): void { setQuery(''); setAccountFilter('all'); setIvMin(''); setIvMax(''); setQualityMin(''); setQualityMax(''); setShinyOnly(false); setSort('recent') }

  return (
    <section className="showcase-page">
      <header className="inventory-header showcase-header">
        <span className="system-label">SHOP-01 // VITRINE LOCAL</span><span className="system-lights" aria-hidden="true">● ● ●</span>
        <div><p className="eyebrow">MEUS ANÚNCIOS</p><h1>Sua vitrine, no seu controle.</h1><p className="subtitle">Fica tudo local. Somente um link gerado por você leva os dados daquele anúncio.</p></div>
        <button className="primary" onClick={onGoInventory}>Escolher no inventário</button>
      </header>

      <div className="showcase-overview">
        <div className="showcase-tabs"><button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>Ativos <b>{activeCount}</b></button><button className={tab === 'removed' ? 'active' : ''} onClick={() => setTab('removed')}>Removidos <b>{removedCount}</b></button></div>
        <div className="showcase-overview-actions"><button className={`contact-settings-button ${selectionMode ? '' : 'catalog-primary'}`} disabled={tab !== 'active'} onClick={() => { setSelectionMode((current) => !current); setSelectedIds([]) }}>{selectionMode ? 'Cancelar seleção' : 'Criar imagem em grupo'}</button><button className="contact-settings-button" onClick={() => setProfileOpen((current) => !current)}>⚙ Dados de contato</button></div>
      </div>

      {profileOpen && <ContactSettings profile={profile} onSave={saveProfile} onClose={() => setProfileOpen(false)} />}

      {selectionMode && <div className="catalog-selection-bar"><label>Nome da vitrine (opcional)<input value={showcaseName} onChange={(event) => setShowcaseName(event.target.value)} placeholder="Ex.: Vitrine do treinador" maxLength={42} /></label><span><b>{selectedIds.length}</b> selecionado(s) · até 6 por imagem</span><button className="primary" disabled={!selectedIds.length || catalogBusy} onClick={() => void generateCatalog()}>{catalogBusy ? 'Gerando…' : 'Gerar imagens'}</button></div>}
      <div className="showcase-filters">
        <label className="showcase-search">Buscar<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome ou código AC1-001" /></label>
        <label>Conta<select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}><option value="all">Todas</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.characterName ?? `Conta ${account.slot}`}</option>)}</select></label>
        <label>IV mínimo<input type="number" min="0" max="192" value={ivMin} onChange={(event) => setIvMin(event.target.value)} placeholder="0" /></label>
        <label>IV máximo<input type="number" min="0" max="192" value={ivMax} onChange={(event) => setIvMax(event.target.value)} placeholder="192" /></label>
        <label>Quality mín.<input type="number" min="0" step="0.001" value={qualityMin} onChange={(event) => setQualityMin(event.target.value)} placeholder="0" /></label>
        <label>Quality máx.<input type="number" min="0" step="0.001" value={qualityMax} onChange={(event) => setQualityMax(event.target.value)} placeholder="4" /></label>
        <label>Ordenar<select value={sort} onChange={(event) => setSort(event.target.value as ShowcaseSort)}><option value="recent">Mais recentes</option><option value="iv-desc">Maior IV</option><option value="quality-desc">Maior Quality</option><option value="price-desc">Maior preço</option><option value="price-asc">Menor preço</option></select></label>
        <button className={`shiny-toggle ${shinyOnly ? 'active' : ''}`} onClick={() => setShinyOnly((current) => !current)}>✦ SHINY</button><button className="clear-filters" onClick={clearFilters}>LIMPAR</button>
      </div>

      {!filtered.length ? (
        <div className="showcase-empty"><img src="./icons/loja.png" alt="" /><h2>{tab === 'active' ? 'Nenhum anúncio ativo' : 'Nenhum anúncio removido'}</h2><p>{tab === 'active' ? 'Abra o inventário e clique em Anunciar no Pokémon que deseja oferecer.' : 'Anúncios arquivados automaticamente ou marcados como vendidos aparecerão aqui.'}</p>{tab === 'active' && <button className="primary" onClick={onGoInventory}>Ir para o inventário</button>}</div>
      ) : (
        <div className="showcase-grid">{filtered.map((listing) => {
          const account = accounts.find((entry) => entry.id === listing.accountId)
          const tier = qualityTier(listing.pokemon.quality)
          const active = (listing.status ?? 'active') === 'active'
          const stillOwned = pokemon.some((entry) => entry.id === listing.pokemonId)
          const priceReview = active ? priceReviewFor(listing) : null
          return (
            <article className={`showcase-card ${active ? '' : 'removed'} ${selectedIds.includes(listing.id) ? 'selected' : ''}`} key={listing.id}>{selectionMode && active && <button className="showcase-select-toggle" aria-pressed={selectedIds.includes(listing.id)} onClick={() => toggleSelection(listing.id)}>{selectedIds.includes(listing.id) ? '✓ Selecionado' : 'Selecionar'}</button>}
              <div className="showcase-card-art"><InventoryImage src={pokemonSpriteUrl(listing.pokemon.speciesId, listing.pokemon.shiny)} alt={listing.pokemon.species} className="showcase-pokemon-image" />{listing.pokemon.shiny && <span>✦ SHINY</span>}{!active && <em>{listing.status === 'sold' ? 'VENDIDO' : 'REMOVIDO'}</em>}</div>
              <div className="showcase-card-body">
                <div><small>CONTA {account?.slot ?? '—'} · {account?.characterName ?? 'SEM PERSONAGEM'}</small><span className="listing-local-code" title="Código que também aparece na imagem compartilhada">{listingCode(listing)}</span><h2>{listing.pokemon.species}</h2><span className="showcase-rarity" style={{ color: tier?.color, borderColor: tier?.color }}>{tier?.name ?? 'Sem raridade'}</span></div>
                <div className="showcase-stats"><span>LV <b>{listing.pokemon.level ?? '—'}</b></span><span>IV <b>{listing.pokemon.iv ?? '—'}</b></span><span>Q <b>{listing.pokemon.quality ?? '—'}</b></span><span>POWER <b>{calculatedPower(listing.pokemon)?.toLocaleString('pt-BR') ?? '—'}</b></span></div>
                <div className="showcase-price"><strong>{money(listing.price)}</strong><span>{listing.negotiable ? 'Aceita propostas' : 'Preço fixo'}</span></div>
                {priceReview && <div className="price-review-prompt"><div><strong>Anunciado há {priceReview.days} dias</strong><span>Quer uma sugestão para tentar vender mais rápido?</span></div><b>{money(priceReview.price)}</b><div><button onClick={() => onAcceptPriceReview(listing.id, priceReview.price)}>Aplicar sugestão</button><button onClick={() => onDismissPriceReview(listing.id)}>Manter preço</button></div></div>}
                {active ? <div className="showcase-actions">
                  <button className="share-main" onClick={() => void generateLink(listing, 'whatsapp')}>Link WhatsApp</button><button onClick={() => void generateLink(listing, 'discord')}>Link Discord</button>
                  <button onClick={() => void copyImage(listing)}>Copiar imagem</button>
                  <button onClick={() => onEdit(listing)}>Editar</button><button className="sold" onClick={() => onSold(listing.id)}>Marcar vendido</button><button className="remove" onClick={() => onArchive(listing.id)}>Remover</button>
                </div> : <div className="showcase-actions removed-actions">
                  <button className="share-main" disabled={!stillOwned} title={stillOwned ? '' : 'O Pokémon não está mais na conta'} onClick={() => onRestore(listing.id)}>Restaurar</button><button className="remove" onClick={() => onDelete(listing.id)}>Apagar histórico</button>
                </div>}
              </div>
            </article>
          )
        })}</div>
      )}
      {!!catalogPages.length && <div className="listing-modal-backdrop"><section className="listing-modal catalog-preview-modal"><div className="listing-modal-heading"><div><p className="eyebrow">VITRINE EM GRUPO</p><h2>Imagem {catalogPage + 1} de {catalogPages.length}</h2></div><button className="listing-close" onClick={() => setCatalogPages([])}>×</button></div><img src={catalogPages[catalogPage]} alt={`Prévia da vitrine, página ${catalogPage + 1}`} /><div className="catalog-preview-actions"><button disabled={catalogPage === 0} onClick={() => setCatalogPage((page) => page - 1)}>← Anterior</button><span>{catalogPage + 1} / {catalogPages.length}</span><button disabled={catalogPage === catalogPages.length - 1} onClick={() => setCatalogPage((page) => page + 1)}>Próxima →</button><button className="primary" onClick={() => void copyCatalog()}>Copiar esta imagem</button></div></section></div>}      {notice && <div className="showcase-notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Fechar aviso">×</button></div>}
    </section>
  )
}

function ContactSettings({ profile, onSave, onClose }: { profile: SellerProfile; onSave: (profile: SellerProfile) => void; onClose: () => void }): React.JSX.Element {
  const [draft, setDraft] = useState(profile)
  return <section className="contact-settings">
    <div><p className="eyebrow">CONTATO DOS ANÚNCIOS</p><h2>Para onde o comprador deve ir?</h2><p>Esses dados ficam neste computador. Eles só entram no anúncio quando você gerar um link.</p></div>
    <div className="contact-fields"><label>WhatsApp com DDD<input value={draft.whatsapp} onChange={(event) => setDraft({ ...draft, whatsapp: event.target.value })} placeholder="55 11 99999-9999" /></label><label>Usuário do Discord<input value={draft.discordUsername} onChange={(event) => setDraft({ ...draft, discordUsername: event.target.value })} placeholder="seu_usuario" /></label><label>ID numérico do Discord<input value={draft.discordUserId} onChange={(event) => setDraft({ ...draft, discordUserId: event.target.value.replace(/\D/g, '') })} placeholder="123456789012345678" /><small>Necessário para abrir seu perfil correto.</small></label><label>Contato preferido<select value={draft.preferredContact} onChange={(event) => setDraft({ ...draft, preferredContact: event.target.value as SellerProfile['preferredContact'] })}><option value="whatsapp">WhatsApp</option><option value="discord">Discord</option></select></label></div>
    <div className="contact-actions"><button className="ghost" onClick={onClose}>Cancelar</button><button className="primary" onClick={() => { onSave(draft); onClose() }}>Salvar contatos</button></div>
  </section>
}
