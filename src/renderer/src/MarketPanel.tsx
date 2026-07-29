import { useMemo, useState } from 'react'
import type { MarketListing } from '../../shared/types'

type SortKey = 'price' | 'name' | 'level' | 'iv' | 'quality' | 'quantity'
type SortRule = { key: SortKey; direction: 'asc' | 'desc' }
const quoteNames = ['Diamond', 'Strange Pheromone', 'Bronze Boss Token']

function number(value: number | undefined): string { return value === undefined ? '—' : value.toLocaleString('pt-BR') }

export default function MarketPanel({ listings }: { listings: MarketListing[] }): React.JSX.Element {
  const [side, setSide] = useState<'sale' | 'request'>('sale')
  const [query, setQuery] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [currency, setCurrency] = useState('all')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [shinyOnly, setShinyOnly] = useState(false)
  const [view, setView] = useState<'rows' | 'cards'>('rows')
  const [pageSize, setPageSize] = useState(30)
  const [page, setPage] = useState(0)
  const [sorts, setSorts] = useState<SortRule[]>([{ key: 'price', direction: 'asc' }])
  const availableCategories = useMemo(() => [...new Set(listings.map((entry) => entry.category).filter(Boolean))].sort(), [listings])
  const currencies = useMemo(() => [...new Set(listings.map((entry) => entry.currency))].sort(), [listings])
  const filtered = useMemo(() => listings.filter((entry) => entry.side === side && (!query || entry.name.toLowerCase().includes(query.toLowerCase())) && (!categories.length || categories.includes(entry.category)) && (currency === 'all' || entry.currency === currency) && (!minPrice || entry.price >= Number(minPrice)) && (!maxPrice || entry.price <= Number(maxPrice)) && (!shinyOnly || entry.shiny)).sort((a, b) => {
    for (const rule of sorts) { const av = a[rule.key] ?? 0; const bv = b[rule.key] ?? 0; const result = typeof av === 'string' ? av.localeCompare(String(bv)) : Number(av) - Number(bv); if (result) return rule.direction === 'asc' ? result : -result }
    return 0
  }), [categories, currency, listings, maxPrice, minPrice, query, shinyOnly, side, sorts])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize)); const visible = filtered.slice(Math.min(page, pageCount - 1) * pageSize, (Math.min(page, pageCount - 1) + 1) * pageSize)
  function toggleSort(key: SortKey): void { setSorts((current) => { const existing = current.find((rule) => rule.key === key); return existing ? current.map((rule): SortRule => rule.key === key ? { ...rule, direction: rule.direction === 'asc' ? 'desc' : 'asc' } : rule) : [...current, { key, direction: key === 'name' ? 'asc' : 'desc' } as SortRule].slice(-3) }) }
  const quote = (name: string) => { const matches = listings.filter((entry) => entry.name.toLowerCase().includes(name.toLowerCase()) && /gold/i.test(entry.currency)); const sale = matches.filter((entry) => entry.side === 'sale').sort((a, b) => a.price - b.price)[0]; const request = matches.filter((entry) => entry.side === 'request').sort((a, b) => b.price - a.price)[0]; return { sale, request } }
  return <section className="market-page">
    <header className="inventory-header"><span className="system-label">MKT-01 // MERCADO LOCAL</span><div><p className="eyebrow">LEITURA DA SESSÃO</p><h1>Mercado organizado.</h1><p className="subtitle">Abra o Mercado Global em uma das contas para atualizar. O painel não compra nem anuncia automaticamente.</p></div></header>
    <div className="market-quotes">{quoteNames.map((name) => { const data = quote(name); return <article key={name}><small>COTAÇÃO EM GOLD</small><b>{name}</b><span>Menor venda <strong>{number(data.sale?.price)}</strong></span><span>Maior compra <strong>{number(data.request?.price)}</strong></span></article> })}</div>
    <div className="market-tabs"><button className={side === 'sale' ? 'active' : ''} onClick={() => { setSide('sale'); setPage(0) }}>LISTAGENS <b>{listings.filter((entry) => entry.side === 'sale').length}</b></button><button className={side === 'request' ? 'active' : ''} onClick={() => { setSide('request'); setPage(0) }}>SOLICITAÇÕES <b>{listings.filter((entry) => entry.side === 'request').length}</b></button></div>
    <div className="market-filters"><label>Buscar<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pokémon ou item" /></label><label>Moeda<select value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="all">Todas</option>{currencies.map((entry) => <option key={entry}>{entry}</option>)}</select></label><label>Preço mínimo<input type="number" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} /></label><label>Preço máximo<input type="number" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} /></label><button className={shinyOnly ? 'active' : ''} onClick={() => setShinyOnly(!shinyOnly)}>✦ SHINY</button><button onClick={() => { setQuery(''); setCategories([]); setCurrency('all'); setMinPrice(''); setMaxPrice(''); setShinyOnly(false) }}>LIMPAR</button></div>
    <div className="market-categories">{availableCategories.map((entry) => <button key={entry} className={categories.includes(entry) ? 'active' : ''} onClick={() => setCategories((current) => current.includes(entry) ? current.filter((item) => item !== entry) : [...current, entry])}>{entry}</button>)}</div>
    <div className="market-toolbar"><span><b>{filtered.length}</b> resultados</span><div><button className={view === 'rows' ? 'active' : ''} onClick={() => setView('rows')}>☷ Linhas</button><button className={view === 'cards' ? 'active' : ''} onClick={() => setView('cards')}>▦ Cards</button><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0) }}><option>10</option><option>30</option><option>50</option></select></div></div>
    {!listings.length ? <div className="market-empty"><h2>Aguardando dados do mercado</h2><p>Abra listagens ou solicitações no Mercado Global do jogo. Os resultados observados aparecerão aqui e permanecerão somente neste computador.</p></div> : view === 'rows' ? <div className="market-table"><table><thead><tr>{([['name','Item'],['price','Preço'],['quantity','Qtd.'],['level','LV'],['iv','IV'],['quality','Quality']] as [SortKey,string][]).map(([key,label]) => { const priority = sorts.findIndex((entry) => entry.key === key); return <th key={key}><button onClick={() => toggleSort(key)}>{label} <span>{priority >= 0 ? `${priority + 1}${sorts[priority].direction === 'asc' ? '↑' : '↓'}` : '↕'}</span></button></th> })}<th>Categoria / NPC</th></tr></thead><tbody>{visible.map((entry) => <tr key={`${entry.slot}-${entry.id}`}><td><b>{entry.shiny ? '✦ ' : ''}{entry.name}</b><small>{entry.seller ?? 'Jogador não informado'}</small></td><td>{number(entry.price)} {entry.currency}</td><td>{number(entry.quantity)}</td><td>{number(entry.level)}</td><td>{number(entry.iv)}</td><td>{number(entry.quality)}</td><td>{entry.category}<small>{entry.npcPrice === undefined ? 'NPC não informado' : `NPC ${number(entry.npcPrice)}`}</small></td></tr>)}</tbody></table></div> : <div className="market-cards">{visible.map((entry) => <article key={`${entry.slot}-${entry.id}`}><small>{entry.category}</small><h3>{entry.shiny ? '✦ ' : ''}{entry.name}</h3><strong>{number(entry.price)} {entry.currency}</strong><p>Qtd. {number(entry.quantity)} · LV {number(entry.level)} · IV {number(entry.iv)} · Q {number(entry.quality)}</p><span>{entry.npcPrice === undefined ? 'Sem comparação NPC' : `NPC ${number(entry.npcPrice)}`}</span></article>)}</div>}
    <div className="market-pagination"><button disabled={page <= 0} onClick={() => setPage((current) => current - 1)}>← Anterior</button><span>{Math.min(page, pageCount - 1) + 1} / {pageCount}</span><button disabled={page >= pageCount - 1} onClick={() => setPage((current) => current + 1)}>Próxima →</button></div>
  </section>
}
