import { useEffect, useMemo, useState } from 'react'
import type { Account, Pokemon, PokemonStats } from '../../shared/types'
import InventoryImage, { pokemonSpriteUrl } from './InventoryImage'
import { analyzePokemon, creatureFor, qualityTier, strongestStat } from './lib/pokemon-analysis'

type Props = { accounts: Account[]; pokemon: Pokemon[]; requestedPokemonId?: string | null; requestVersion?: number }

const statLabels: Array<[keyof PokemonStats, string]> = [
  ['hp', 'HP'], ['attack', 'Ataque'], ['defense', 'Defesa'],
  ['specialAttack', 'Atq. Especial'], ['specialDefense', 'Def. Especial'], ['speed', 'Velocidade']
]

export default function LabPanel({ accounts, pokemon, requestedPokemonId, requestVersion }: Props): React.JSX.Element {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const available = useMemo(() => pokemon.filter((entry) => entry.accountId === accountId), [accountId, pokemon])
  const [pokemonId, setPokemonId] = useState('')

  useEffect(() => {
    if (!requestedPokemonId) return
    const requested = pokemon.find((entry) => entry.id === requestedPokemonId)
    if (!requested) return
    setAccountId(requested.accountId)
    setPokemonId(requested.id)
  }, [pokemon, requestedPokemonId, requestVersion])

  useEffect(() => {
    if (!accounts.some((account) => account.id === accountId)) setAccountId(accounts[0]?.id ?? '')
  }, [accountId, accounts])

  useEffect(() => {
    if (!available.some((entry) => entry.id === pokemonId)) setPokemonId(available[0]?.id ?? '')
  }, [available, pokemonId])

  const selected = available.find((entry) => entry.id === pokemonId)
  const analysis = selected ? analyzePokemon(selected) : null
  const tier = selected ? qualityTier(selected.quality) : null
  const creature = selected ? creatureFor(selected) : undefined
  const strongest = selected ? strongestStat(selected.stats) : null

  return (
    <section className="lab-page">
      <header className="inventory-header lab-header">
        <span className="system-label">LAB-01 // ANÁLISE DE POTENCIAL</span>
        <span className="system-lights" aria-hidden="true">● ● ●</span>
        <div>
          <p className="eyebrow">LABORATÓRIO</p>
          <h1>Entenda a força do seu Pokémon.</h1>
          <p className="subtitle">Análise local baseada em Quality, IV total, espécie e stats recebidos do jogo.</p>
        </div>
      </header>

      <div className="lab-selectors">
        <label>Conta
          <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            {accounts.map((account) => <option key={account.id} value={account.id}>Conta {account.slot} · {account.characterName ?? 'Sem personagem'}</option>)}
          </select>
        </label>
        <label>Pokémon
          <select value={pokemonId} onChange={(event) => setPokemonId(event.target.value)}>
            {available.map((entry) => {
              const rarity = qualityTier(entry.quality)
              return <option key={entry.id} value={entry.id}>{entry.species} · {rarity?.name ?? 'Sem raridade'} · LV {entry.level ?? '—'} · Q {entry.quality ?? '—'} · IV {entry.iv ?? '—'}</option>
            })}
          </select>
        </label>
      </div>

      {!selected || !analysis ? (
        <div className="lab-empty"><h2>Nenhum Pokémon disponível</h2><p>Abra a box desta conta no jogo para sincronizar.</p></div>
      ) : (
        <>
          <div className="lab-summary">
            <article className={`lab-verdict potential-${analysis.tone}`}>
              <p className="eyebrow">POTENCIAL ESTIMADO</p>
              <strong>{analysis.label}</strong>
              <span className={`lab-confidence confidence-${analysis.confidence}`}>{analysis.confidenceLabel}</span>
              <small>{analysis.score === null ? '—' : `${Math.round(analysis.score * 100)}/100`} · {analysis.confidenceReason}</small>
            </article>
            <article><span>Quality</span><strong>{selected.quality ?? '—'}</strong><small style={{ color: tier?.color }}>{tier?.name ?? 'Sem classificação'}</small></article>
            <article><span>IV total</span><strong>{selected.iv ?? '—'}</strong><small>{analysis.ivScore === undefined ? 'Sem leitura' : `${Math.round(analysis.ivScore * 100)}% do intervalo 6–192`}</small></article>
            <article><span>Power</span><strong>{analysis.power?.toLocaleString('pt-BR') ?? '—'}</strong><small>{selected.stats ? 'Calculado com os stats recebidos' : 'Abra os detalhes para receber stats'}</small></article>
          </div>

          <div className="lab-grid">
            <section className="lab-card">
              <div className="lab-pokemon-title">
                <div className="lab-pokemon-identity"><InventoryImage src={pokemonSpriteUrl(selected.speciesId ?? creature?.id, selected.shiny)} alt={selected.species} className="lab-pokemon-sprite" /><div><p className="eyebrow">{creature?.type1 ?? 'POKÉMON'}{creature?.type2 ? ` / ${creature.type2}` : ''}</p><h2>{selected.species}</h2><span className="lab-rarity-label" style={{ borderColor: tier?.color, color: tier?.color }}>{tier?.name ?? 'Sem raridade'}</span></div></div>
                {selected.shiny && <span className="shiny">Shiny</span>}
              </div>
              <div className="lab-facts">
                <span>Conta <b>{accounts.find((account) => account.id === selected.accountId)?.slot}</b></span>
                <span>Nível <b>{selected.level ?? '—'}</b></span>
                <span>Raridade <b style={{ color: tier?.color }}>{tier?.name ?? '—'}</b></span>
                <span>Melhor stat <b>{strongest ? `${strongest.name} ${strongest.value}` : 'Aguardando stats'}</b></span>
              </div>
              <p className="lab-explanation">Potencial é uma triagem baseada no IV total informado pelo jogo e na Quality. A confiança indica se nível e stats permitem validar essa leitura: abaixo do nível 15 ela é preliminar; no nível 15 ou superior, com os seis stats, é alta. O Power atual usa somente os stats recebidos do jogo.</p>
            </section>

            <section className="lab-card">
              <p className="eyebrow">ATRIBUTOS ATUAIS</p>
              <h2>Distribuição dos stats</h2>
              {selected.stats ? (
                <div className="stat-list">
                  {statLabels.map(([key, label]) => {
                    const current = selected.stats![key]
                    const base = creature?.baseStats[key]
                    const width = Math.min(100, current / Math.max(...Object.values(selected.stats!)) * 100)
                    return <div className="stat-row" key={key}><span>{label}</span><div><i style={{ width: `${width}%` }} /></div><b>{current}</b><small>{base === undefined ? '' : `base ${base}`}</small></div>
                  })}
                </div>
              ) : <p className="lab-missing">Os stats ainda não vieram nessa leitura. Abra os detalhes do Pokémon dentro da box e sincronize novamente.</p>}
            </section>
          </div>
        </>
      )}
    </section>
  )
}
