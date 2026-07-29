import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  Account,
  GameControl,
  GameSlot,
  GameViewBounds,
  GameViewPlacement,
  GameViewStatus,
  InventoryItem,
  HuntSession
} from '../../shared/types'
import InventoryImage, { itemImageUrl } from './InventoryImage'

type Props = {
  accounts: Account[]
  initialSlot: GameSlot
  active: boolean
  accountOpenRequest: number
  gridOpenRequest: number
  items: InventoryItem[]
  huntSessions: HuntSession[]
  onOpenAccount: (slot: GameSlot) => void
  onShowGrid: () => void
  accountsManagerOpen: boolean
  onCloseAccountsManager: () => void
  onAddAccount: () => void
  onRemoveAccount: (account: Account) => void
  settings: { keepLogin: true; ecoMode: boolean; sleepMode: boolean; trackedItems: Array<{ name: string; low: number }>; soundEnabled: boolean; notifyShiny: boolean; stallMinutes: number }
  onSettingsChange: (settings: { keepLogin: true; ecoMode: boolean; sleepMode: boolean; trackedItems: Array<{ name: string; low: number }>; soundEnabled: boolean; notifyShiny: boolean; stallMinutes: number }) => void
}

const GAME_DESIGN_WIDTH = 1280
const GAME_DESIGN_HEIGHT = 720
const SINGLE_MODE_ZOOM = 0.7
const GRID_MODE_ZOOM = 1
const ZOOM_PREFERENCES_KEY = 'pokecentral.launcher.zoom.v1'
type ZoomMode = 'single' | 'grid'
type ZoomPreferences = Record<ZoomMode, Partial<Record<GameSlot, number>>>

function loadZoomPreferences(): ZoomPreferences {
  try {
    const saved = localStorage.getItem(ZOOM_PREFERENCES_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<ZoomPreferences>
      return { grid: parsed.grid ?? {}, single: parsed.single ?? {} }
    }
  } catch { /* Preferências inválidas voltam aos tamanhos sugeridos. */ }
  return { grid: {}, single: {} }
}
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum))
}

function normalizedItemName(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function compactBallQuantity(quantity: number): string {
  if (quantity >= 1_000_000) return `${(quantity / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}m`
  if (quantity >= 10_000) return `${(quantity / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`
  return quantity.toLocaleString('pt-BR')
}

function syncDescription(lastSync?: string): string {
  if (!lastSync) return 'ainda não sincronizado'
  const elapsed = Math.max(0, Date.now() - new Date(lastSync).getTime())
  const minutes = Math.floor(elapsed / 60_000)
  const relative = minutes < 1 ? 'agora' : minutes < 60 ? `há ${minutes} min` : minutes < 1440 ? `há ${Math.floor(minutes / 60)} h` : `há ${Math.floor(minutes / 1440)} d`
  return `${relative} · ${new Date(lastSync).toLocaleString('pt-BR')}`
}

function farmStalled(slot: GameSlot, sessions: HuntSession[], minutes: number): HuntSession | undefined {
  const current = sessions.filter((entry) => entry.slot === slot && !entry.endedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  if (!current || current.huntName === 'Hunt não identificada' || !current.pokemonName) return undefined
  const lastActivity = new Date(current.lastActivityAt ?? current.lastKillAt ?? current.startedAt).getTime()
  const collectorFresh = Date.now() - new Date(current.updatedAt).getTime() < 30_000
  return collectorFresh && Date.now() - lastActivity >= minutes * 60_000 ? current : undefined
}
function StockSummary({ account, items, trackedItems, compact = true }: { account?: Account; items: InventoryItem[]; trackedItems: Array<{ name: string; low: number }>; compact?: boolean }): React.JSX.Element {
  const accountItems = items.filter((entry) => entry.accountId === account?.id)
  const tracked = trackedItems.slice(0, 3).map((definition) => {
    const key = normalizedItemName(definition.name)
    const matches = accountItems.filter((entry) => normalizedItemName(entry.name).includes(key))
    const known = matches.length > 0
    const quantity = matches.reduce((sum, entry) => sum + entry.quantity, 0)
    const state = !known ? 'unknown' : quantity === 0 ? 'empty' : quantity < definition.low ? 'low' : 'ok'
    const source = matches[0]
    return { ...definition, key, label: definition.name, short: definition.name.split(/\s+/)[0], known, quantity, state, source }
  })
  return <div className={`ball-stock-summary ${compact ? 'compact' : 'wide'}`} aria-label={`Itens acompanhados da Conta ${account?.slot ?? ''}`}>
    {tracked.map((item) => <div key={item.key} className={`ball-stock-chip ${item.state}`} title={`${item.label}: ${item.known ? item.quantity.toLocaleString('pt-BR') : 'não sincronizado'} · alerta abaixo de ${item.low} · ${syncDescription(account?.lastSync)}`}>
      <InventoryImage src={itemImageUrl(item.source?.icon, item.label)} alt={item.label} className="ball-stock-icon" />
      {!compact && <span>{item.short}</span>}
      <b>{item.known ? compactBallQuantity(item.quantity) : '—'}</b>
    </div>)}
  </div>
}
function boundsFromElement(element: HTMLElement): GameViewBounds {
  const rect = element.getBoundingClientRect()
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  }
}

export default function LauncherPanel({ accounts, items, huntSessions, initialSlot, active, accountOpenRequest, gridOpenRequest, onOpenAccount, onShowGrid, accountsManagerOpen, onCloseAccountsManager, onAddAccount, onRemoveAccount, settings, onSettingsChange }: Props): React.JSX.Element {
  const initialZoomPreferences = useMemo(loadZoomPreferences, [])
  const [selectedSlot, setSelectedSlot] = useState<GameSlot>(initialSlot)
  const [viewMode, setViewMode] = useState<ZoomMode>('grid')
  const [zoomPreferences, setZoomPreferences] = useState<ZoomPreferences>(initialZoomPreferences)
  const zoomPreferencesRef = useRef(zoomPreferences)
  const [zoomBySlot, setZoomBySlot] = useState<Partial<Record<GameSlot, number>>>(initialZoomPreferences.grid)
  const zoomBySlotRef = useRef(zoomBySlot)
  const [statuses, setStatuses] = useState<Partial<Record<GameSlot, GameViewStatus>>>({})
  const [notice, setNotice] = useState('Todas as contas ficam visíveis. Use Expandir para abrir uma delas.')
  const hostRefs = useRef(new Map<GameSlot, HTMLDivElement>())

  useEffect(() => setSelectedSlot(initialSlot), [initialSlot])
  useEffect(() => localStorage.setItem(ZOOM_PREFERENCES_KEY, JSON.stringify(zoomPreferences)), [zoomPreferences])

  useEffect(() => {
    if (accountOpenRequest === 0) return
    setSelectedSlot(initialSlot)
    setZoomBySlot((current) => ({ ...current, [initialSlot]: zoomPreferencesRef.current.single[initialSlot] ?? SINGLE_MODE_ZOOM }))
    setViewMode('single')
    setNotice(`Conta ${initialSlot} expandida. Use Todas as contas no menu para voltar à grade.`)
  }, [accountOpenRequest, initialSlot])

  useEffect(() => {
    if (gridOpenRequest === 0) return
    setZoomBySlot(Object.fromEntries(accounts.map((account) => [account.slot, zoomPreferencesRef.current.grid[account.slot] ?? GRID_MODE_ZOOM])))
    setViewMode('grid')
    setNotice('Todas as contas estão visíveis em grade.')
  }, [gridOpenRequest])

  useEffect(() => window.pokecentral.onGameStatus((status) => {
    setStatuses((current) => ({ ...current, [status.slot]: status }))
    if (status.slot !== selectedSlot) return
    if (status.state === 'loading') setNotice(`Carregando a Conta ${status.slot}…`)
    if (status.state === 'ready') setNotice(`Conta ${status.slot} pronta. O login permanece salvo.`)
    if (status.state === 'stalled') setNotice(`Possível travamento na Conta ${status.slot}. Verifique antes de recarregar.`)
    if (status.state === 'error') setNotice(status.message ?? 'Não foi possível carregar a sessão.')
  }), [selectedSlot])

  const accountSlotKey = accounts.map((account) => account.slot).join(',')
  const configuredSlots = useMemo(
    () => accountSlotKey.split(',').filter(Boolean).map((slot) => Number(slot) as GameSlot),
    [accountSlotKey]
  )
  const visibleSlots = useMemo(
    () => viewMode === 'grid' ? configuredSlots : [selectedSlot],
    [configuredSlots, selectedSlot, viewMode]
  )
  const visibleSlotsRef = useRef(visibleSlots)
  visibleSlotsRef.current = visibleSlots

  useEffect(() => {
    for (const slot of configuredSlots) {
      void window.pokecentral.controlGameAccount(slot, settings.ecoMode ? 'eco-on' : 'eco-off')
      void window.pokecentral.controlGameAccount(slot, settings.sleepMode ? 'sleep-on' : 'sleep-off')
    }
  }, [accountSlotKey, settings.ecoMode, settings.sleepMode])

  const collectPlacements = useCallback((): GameViewPlacement[] => {
    return visibleSlotsRef.current.flatMap((slot) => {
      const element = hostRefs.current.get(slot)
      if (!element) return []
      const bounds = boundsFromElement(element)
      const automaticFit = Math.min(bounds.width / GAME_DESIGN_WIDTH, bounds.height / GAME_DESIGN_HEIGHT)
      const userZoom = zoomBySlotRef.current[slot] ?? 1
      return [{ slot, bounds, zoomFactor: clamp(automaticFit * userZoom, 0.25, 1.5), persistSession: true }]
    })
  }, [])

  const syncLayout = useCallback((initial: boolean): void => {
    if (settings.sleepMode) { void window.pokecentral.hideGameLayout(); return }
    if (!active || accountsManagerOpen) return
    const placements = collectPlacements()
    if (!placements.length) return
    const operation = initial
      ? window.pokecentral.showGameLayout(placements)
      : window.pokecentral.updateGameLayout(placements)
    void operation.catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('ERR_ABORTED')) setNotice(message || 'Não foi possível organizar as telas.')
    })
  }, [active, accountsManagerOpen, collectPlacements, settings.sleepMode])

  useLayoutEffect(() => {
    zoomBySlotRef.current = zoomBySlot
    zoomPreferencesRef.current = zoomPreferences
  })

  useLayoutEffect(() => {
    if (!active || accountsManagerOpen) return
    const frame = requestAnimationFrame(() => syncLayout(false))
    return () => cancelAnimationFrame(frame)
  }, [active, syncLayout, zoomBySlot])

  useLayoutEffect(() => {
    if (!active || accountsManagerOpen) {
      void window.pokecentral.hideGameLayout()
      return
    }

    let innerFrame = 0
    const frame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => syncLayout(true))
    })
    const observer = new ResizeObserver(() => syncLayout(false))
    for (const element of hostRefs.current.values()) observer.observe(element)
    const update = (): void => syncLayout(false)
    window.addEventListener('resize', update)

    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(innerFrame)
      observer.disconnect()
      window.removeEventListener('resize', update)
      void window.pokecentral.hideGameLayout()
    }
  }, [active, accountsManagerOpen, viewMode, selectedSlot, accounts.length, syncLayout])

  useEffect(() => () => {
    void window.pokecentral.hideGameLayout()
  }, [])

  function openAccount(slot: GameSlot): void {
    onOpenAccount(slot)
    setSelectedSlot(slot)
    setZoomBySlot((current) => ({ ...current, [slot]: zoomPreferencesRef.current.single[slot] ?? SINGLE_MODE_ZOOM }))
    setViewMode('single')
    setNotice(`Conta ${slot} expandida. Use Voltar à grade para ver todas novamente.`)
  }

  function showGrid(): void {
    onShowGrid()
    setZoomBySlot(Object.fromEntries(configuredSlots.map((slot) => [slot, zoomPreferencesRef.current.grid[slot] ?? GRID_MODE_ZOOM])))
    setViewMode('grid')
    setNotice('Todas as contas ficam visíveis. Use Expandir para abrir uma delas.')
  }

  useEffect(() => {
    if (!active || accountsManagerOpen) return
    const handleShortcut = (event: KeyboardEvent): void => {
      const target = event.target
      if (target instanceof HTMLElement && target.matches('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === 'Escape' && viewMode === 'single') {
        event.preventDefault()
        showGrid()
        return
      }
      if (!event.ctrlKey) return
      if (event.key === '0') {
        event.preventDefault()
        showGrid()
        return
      }
      const slot = Number(event.key) as GameSlot
      if (slot >= 1 && slot <= 4 && configuredSlots.includes(slot)) {
        event.preventDefault()
        openAccount(slot)
        return
      }
      if (event.key.toLowerCase() === 'r') {
        event.preventDefault()
        controlSlot(selectedSlot, 'reload')
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [active, accountsManagerOpen, configuredSlots, selectedSlot, viewMode])
  function confirmReload(slot: GameSlot): void {
    if (!window.confirm(`A Conta ${slot} parou de responder. Deseja recarregar somente esta página? O login salvo será mantido.`)) return
    controlSlot(slot, 'reload')
  }
  function controlSlot(slot: GameSlot, action: GameControl): void {
    void window.pokecentral.controlGameAccount(slot, action)
    if (action === 'reload') setNotice(`Recarregando a Conta ${slot}…`)
  }

  function control(action: GameControl): void {
    controlSlot(selectedSlot, action)
  }

  function setSlotZoom(slot: GameSlot, value: number): void {
    const next = clamp(value, 0.5, 1.4)
    zoomBySlotRef.current = { ...zoomBySlotRef.current, [slot]: next }
    setZoomBySlot(zoomBySlotRef.current)
    setZoomPreferences((current) => ({ ...current, [viewMode]: { ...current[viewMode], [slot]: next } }))
  }

  function adjustSlotZoom(slot: GameSlot, delta: number): void {
    setSlotZoom(slot, (zoomBySlotRef.current[slot] ?? (viewMode === 'single' ? SINGLE_MODE_ZOOM : GRID_MODE_ZOOM)) + delta)
  }

  function resetSlotZoom(slot: GameSlot): void {
    setSlotZoom(slot, viewMode === 'single' ? SINGLE_MODE_ZOOM : GRID_MODE_ZOOM)
  }


  async function readInventory(): Promise<void> {
    const snapshot = await window.pokecentral.getInventorySnapshot(selectedSlot)
    if (snapshot && snapshot.pokemon.length + snapshot.items.length > 0) {
      setNotice(`${snapshot.pokemon.length} Pokémon e ${snapshot.items.length} tipos de item disponíveis no inventário.`)
    } else {
      setNotice('Abra a box, a área de Pokébolas ou a mochila no jogo para receber os dados.')
    }
  }

  const selectedAccount = accounts.find((account) => account.slot === selectedSlot)
  const selectedStatus = statuses[selectedSlot]
  const selectedFarmStalled = farmStalled(selectedSlot, huntSessions, settings.stallMinutes)
  const trackableItems = [...new Map(items.map((item) => [normalizedItemName(item.name), item.name])).values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  function toggleTrackedItem(name: string): void {
    const exists = settings.trackedItems.some((item) => normalizedItemName(item.name) === normalizedItemName(name))
    if (!exists && settings.trackedItems.length >= 3) { setNotice('Você pode acompanhar até três itens por vez.'); return }
    onSettingsChange({ ...settings, trackedItems: exists ? settings.trackedItems.filter((item) => normalizedItemName(item.name) !== normalizedItemName(name)) : [...settings.trackedItems, { name, low: 100 }] })
  }

  return (
    <section className={`launcher-page launcher-clean mode-${viewMode} ${settings.sleepMode ? 'sleeping' : ''} ${active ? 'active' : 'inactive'}`}>
      <div className="game-terminal">
        {settings.sleepMode && <div className="sleep-screen"><div><span>☾</span><h2>MODO SLEEP</h2><p>As contas continuam rodando. Coleta, estoque e alertas permanecem ativos.</p><section>{accounts.map((account) => <article key={account.id}><b>CONTA {account.slot}</b><strong>{account.characterName ?? 'Aguardando'}</strong><StockSummary account={account} items={items} trackedItems={settings.trackedItems} /></article>)}</section><button onClick={() => onSettingsChange({ ...settings, sleepMode: false })}>ACORDAR TELAS</button></div></div>}
        {viewMode === 'single' && <div className="game-toolbar launcher-toolbar-clean">
          <div className="game-toolbar-title">
            <img src="./icons/hub.png" alt="" />
            <span>
              <strong>{`Conta ${selectedSlot} · ${selectedAccount?.characterName ?? selectedStatus?.characterName ?? 'Aguardando personagem'}`}</strong>
              <small>{notice}</small>{settings.ecoMode && <em className="eco-indicator">ECO 20 FPS</em>}
            </span>
          </div>
          {selectedStatus?.state === 'stalled' || selectedFarmStalled ? <button className="stall-warning wide" onClick={() => confirmReload(selectedSlot)}>⚠ {selectedStatus?.state === 'stalled' ? 'Página sem resposta' : `Farm sem atividade há ${settings.stallMinutes} min`} · Recarregar</button> : <StockSummary account={selectedAccount} items={items} trackedItems={settings.trackedItems} compact={false} />}

            <div className="game-toolbar-actions">
              <button className="back-to-grid" onClick={showGrid} title="Voltar à grade · Ctrl+0 ou Esc">← VOLTAR À GRADE</button>
              <button onClick={() => adjustSlotZoom(selectedSlot, -0.1)} title="Reduzir zoom">ZOOM −</button>
              <button className="zoom-reset" onClick={() => resetSlotZoom(selectedSlot)} title="Voltar ao padrão de 70%">PADRÃO {Math.round((zoomBySlot[selectedSlot] ?? SINGLE_MODE_ZOOM) * 100)}%</button>
              <button onClick={() => adjustSlotZoom(selectedSlot, 0.1)} title="Ampliar zoom">ZOOM +</button>

              <button onClick={() => control('reload')}>RECARREGAR</button>
              <button className="inventory-sync" onClick={() => void readInventory()}>SINCRONIZAR</button>
            </div>
        </div>}

        <div className={`game-stage mode-${viewMode} count-${visibleSlots.length}`}>
          {visibleSlots.map((slot) => {
            const account = accounts.find((item) => item.slot === slot)
            const status = statuses[slot]
            const stalledFarm = farmStalled(slot, huntSessions, settings.stallMinutes)
            return (
              <div className={`game-frame account-color-${slot} ${selectedSlot === slot ? 'selected' : ''}`} key={slot}>
                {viewMode === 'grid' && (
                  <div className="game-frame-label">
                    <div className="game-frame-identity">
                      <b>CONTA {slot}</b>
                      <span>
                        <strong>{account?.characterName ?? status?.characterName ?? 'Aguardando login'}</strong>
                        <i className={`game-state ${status?.state ?? 'idle'}`} />
                        {settings.ecoMode && <em className="eco-indicator compact">ECO</em>}
                      </span>
                    </div>
                    {status?.state === 'stalled' || stalledFarm ? <button className="stall-warning" onClick={() => confirmReload(slot)} title={status?.state === 'stalled' ? status.message : `Sem mudança em kills, XP, loot ou capturas há ${settings.stallMinutes} minutos.`}>⚠ VERIFICAR</button> : <StockSummary account={account} items={items} trackedItems={settings.trackedItems} />}
                    <div className="game-frame-actions">
                      <div className="frame-zoom-group" aria-label={`Zoom da Conta ${slot}`}>
                        <button className="frame-zoom" onClick={() => adjustSlotZoom(slot, -0.1)} title={`Reduzir zoom da Conta ${slot}`} aria-label={`Reduzir zoom da Conta ${slot}`}>−</button>
                        <button className="frame-zoom-value" onClick={() => resetSlotZoom(slot)} title={`Voltar a Conta ${slot} para 100%`} aria-label={`Zoom da Conta ${slot}: ${Math.round((zoomBySlot[slot] ?? GRID_MODE_ZOOM) * 100)}%. Clique para voltar a 100%.`}>{Math.round((zoomBySlot[slot] ?? GRID_MODE_ZOOM) * 100)}%</button>
                        <button className="frame-zoom" onClick={() => adjustSlotZoom(slot, 0.1)} title={`Ampliar zoom da Conta ${slot}`} aria-label={`Ampliar zoom da Conta ${slot}`}>+</button>
                      </div>
                      <button className="frame-reload" onClick={() => controlSlot(slot, 'reload')} title={`Recarregar Conta ${slot}`} aria-label={`Recarregar Conta ${slot}`}>↻</button>
                      <button className="frame-expand" onClick={() => openAccount(slot)} title={`Ampliar Conta ${slot} · Ctrl+${slot}`}>AMPLIAR</button>
                    </div>
                  </div>
                )}
                <div
                  className="game-host"
                  ref={(element) => {
                    if (element) hostRefs.current.set(slot, element)
                    else hostRefs.current.delete(slot)
                  }}
                />
              </div>
            )
          })}
        </div>
      </div>
      {accountsManagerOpen && <div className="accounts-manager-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCloseAccountsManager() }}>
        <section className="accounts-manager" role="dialog" aria-modal="true" aria-labelledby="accounts-manager-title">
          <div className="accounts-manager-heading"><div><p>CONTAS E PREFERÊNCIAS</p><h2 id="accounts-manager-title">Configurações</h2></div><button onClick={onCloseAccountsManager} aria-label="Fechar">×</button></div>
          <p className="accounts-manager-note">Controle as sessões e os avisos do aplicativo em um único lugar.</p><div className="settings-group"><div className="settings-group-title"><b>ACESSO E DESEMPENHO</b><small>Preferências deste computador</small></div><label className="settings-row fixed"><span><strong>Manter login das contas</strong><small>Permanece ativo após fechar ou atualizar o aplicativo.</small></span><b>SEMPRE ATIVO</b></label><label className="settings-row"><span><strong>Modo Econômico</strong><small>Reduz a taxa visual para 20 FPS; o jogo e os avisos continuam funcionando.</small></span><input type="checkbox" checked={settings.ecoMode} onChange={(event) => onSettingsChange({ ...settings, ecoMode: event.target.checked, sleepMode: event.target.checked ? false : settings.sleepMode })} /></label><label className="settings-row"><span><strong>Modo Sleep</strong><small>Oculta as telas e usa 10 FPS, mantendo hunt, coleta e alertas.</small></span><input type="checkbox" checked={settings.sleepMode} onChange={(event) => onSettingsChange({ ...settings, sleepMode: event.target.checked, ecoMode: event.target.checked ? false : settings.ecoMode })} /></label></div>
          <div className="accounts-manager-list">{accounts.map((account) => <div key={account.id} className={`account-color-${account.slot}`}><img src="./icons/conta.png" alt="" /><span><strong>Conta {account.slot}</strong><small>{account.characterName ?? 'Aguardando identificação'}</small></span><b className={account.status}>{account.status === 'ready' ? 'Pronta' : account.status === 'attention' ? 'Atenção' : 'Aguardando'}</b><button className="remove-account-button" onClick={() => onRemoveAccount(account)}>REMOVER</button></div>)}</div>
          <div className="settings-group"><div className="settings-group-title"><b>ITENS ACOMPANHADOS</b><small>Escolha até três para a barra das contas</small></div><div className="tracked-item-picker">{trackableItems.length ? trackableItems.map((name) => { const selected = settings.trackedItems.find((item) => normalizedItemName(item.name) === normalizedItemName(name)); return <label key={name} className={selected ? 'selected' : ''}><input type="checkbox" checked={Boolean(selected)} onChange={() => toggleTrackedItem(name)} /><span>{name}</span>{selected && <input type="number" min="0" value={selected.low} title="Avisar abaixo de" onChange={(event) => onSettingsChange({ ...settings, trackedItems: settings.trackedItems.map((item) => normalizedItemName(item.name) === normalizedItemName(name) ? { ...item, low: Math.max(0, Number(event.target.value)) } : item) })} />}</label> }) : <p>Sincronize a mochila para escolher outros itens.</p>}</div></div>
          <div className="settings-group"><div className="settings-group-title"><b>AVISOS DE HUNT</b><small>Preferências gerais</small></div><label className="settings-row"><span><strong>Avisar captura de shiny</strong><small>Mostra um alerta dentro do aplicativo.</small></span><input type="checkbox" checked={settings.notifyShiny} onChange={(event) => onSettingsChange({ ...settings, notifyShiny: event.target.checked })} /></label><label className={`settings-row ${settings.notifyShiny ? '' : 'disabled'}`}><span><strong>Som ao capturar shiny</strong><small>Toca um aviso curto quando um shiny for detectado.</small></span><input type="checkbox" checked={settings.soundEnabled} disabled={!settings.notifyShiny} onChange={(event) => onSettingsChange({ ...settings, soundEnabled: event.target.checked })} /></label><label className="settings-row"><span><strong>Avisar farm sem kills</strong><small>Tempo antes de sinalizar possível travamento.</small></span><select value={settings.stallMinutes} onChange={(event) => onSettingsChange({ ...settings, stallMinutes: Number(event.target.value) })}><option value="5">5 minutos</option><option value="10">10 minutos</option><option value="20">20 minutos</option></select></label></div><div className="accounts-manager-actions"><span>{accounts.length}/4 contas configuradas</span><button onClick={onAddAccount} disabled={accounts.length >= 4}>+ Adicionar conta</button><button className="primary" onClick={onCloseAccountsManager}>Concluir</button></div>
        </section>
      </div>}
    </section>
  )
}
