import catalog from '../data/game-catalog.json'
import type { Pokemon, PokemonStats } from '../../../shared/types'

export type QualityTier = {
  key: string
  name: string
  minimum: number
  color: string
}

export type PotentialRating = {
  score: number | null
  label: 'Dados incompletos' | 'Baixo' | 'Regular' | 'Bom' | 'Ótimo' | 'Excepcional'
  tone: 'muted' | 'low' | 'regular' | 'good' | 'great' | 'exceptional'
  qualityScore?: number
  ivScore?: number
  power?: number
  confidence: 'insufficient' | 'preliminary' | 'high'
  confidenceLabel: 'Dados insuficientes' | 'Estimativa preliminar' | 'Alta confiança'
  confidenceReason: string
}

type CreatureCatalogEntry = {
  id: number
  name: string
  type1: string
  type2: string | null
  baseStats: PokemonStats
  huntVariant?: boolean
}

type ItemCatalogEntry = {
  id: number
  name: string
  icon: string | null
  category: string
  rare: boolean
  npcPrice: number | null
}

const creatures = (catalog.creatures as CreatureCatalogEntry[]).filter((entry) => !entry.huntVariant)
const items = catalog.items as ItemCatalogEntry[]
const creatureById = new Map(creatures.map((entry) => [entry.id, entry]))
const creatureByName = new Map(creatures.map((entry) => [entry.name.toLowerCase(), entry]))
const itemById = new Map(items.map((entry) => [entry.id, entry]))

export const qualityTierOptions: QualityTier[] = [
  { key: 'weak', name: 'Fraco', minimum: Number.NEGATIVE_INFINITY, color: '#9aa6b3' },
  { key: 'common', name: 'Comum', minimum: 1, color: '#63d873' },
  { key: 'uncommon', name: 'Incomum', minimum: 1.1, color: '#7fd4ff' },
  { key: 'rare', name: 'Raro', minimum: 1.3, color: '#b06cff' },
  { key: 'epic', name: 'Épico', minimum: 1.5, color: '#f0c040' },
  { key: 'legendary', name: 'Lendário', minimum: 1.7, color: '#ff8c3c' },
  { key: 'mythic', name: 'Mítico', minimum: 2, color: '#d45cff' },
  { key: 'ancient', name: 'Ancestral', minimum: 3, color: '#e6c36a' },
  { key: 'divine', name: 'Divino', minimum: 4, color: '#dbefff' }
]

export function qualityTier(value: string | number | undefined): QualityTier | null {
  const quality = Number(value)
  if (!Number.isFinite(quality)) return null
  for (let index = qualityTierOptions.length - 1; index >= 0; index -= 1) {
    if (quality >= qualityTierOptions[index].minimum) return qualityTierOptions[index]
  }
  return qualityTierOptions[0]
}

export function creatureFor(pokemon: Pokemon): CreatureCatalogEntry | undefined {
  return pokemon.speciesId ? creatureById.get(pokemon.speciesId) : creatureByName.get(pokemon.species.toLowerCase())
}

export function itemCatalogFor(itemId: number | undefined): ItemCatalogEntry | undefined {
  return itemId === undefined ? undefined : itemById.get(itemId)
}

export function calculatedPower(pokemon: Pokemon): number | undefined {
  if (pokemon.power !== undefined && Number.isFinite(pokemon.power)) return pokemon.power
  if (!pokemon.stats) return undefined
  const quality = Number(pokemon.quality)
  if (!Number.isFinite(quality)) return undefined
  const total = Object.values(pokemon.stats).reduce((sum, value) => sum + value, 0)
  return Math.round(total * quality)
}

function normalizedQuality(quality: number): number {
  const points: Array<[number, number]> = [
    [0.8, 0], [1, 0.15], [1.1, 0.25], [1.3, 0.4], [1.5, 0.55],
    [1.7, 0.7], [2, 0.82], [3, 0.93], [4, 1]
  ]
  if (quality <= points[0][0]) return points[0][1]
  for (let index = 1; index < points.length; index += 1) {
    const [maximum, maximumScore] = points[index]
    const [minimum, minimumScore] = points[index - 1]
    if (quality <= maximum) {
      const progress = (quality - minimum) / (maximum - minimum)
      return minimumScore + (maximumScore - minimumScore) * progress
    }
  }
  return 1
}

export function analyzePokemon(pokemon: Pokemon): PotentialRating {
  const quality = Number(pokemon.quality)
  const iv = Number(pokemon.iv)
  const hasQuality = Number.isFinite(quality)
  const hasIv = Number.isFinite(iv)
  if (!hasQuality && !hasIv) {
    return {
      score: null,
      label: 'Dados incompletos',
      tone: 'muted',
      confidence: 'insufficient',
      confidenceLabel: 'Dados insuficientes',
      confidenceReason: 'Quality e IV total ainda não foram recebidos.'
    }
  }

  const qualityScore = hasQuality ? normalizedQuality(quality) : undefined
  const ivScore = hasIv ? Math.max(0, Math.min(1, (iv - 6) / 186)) : undefined
  const score = qualityScore !== undefined && ivScore !== undefined
    ? qualityScore * 0.55 + ivScore * 0.45
    : qualityScore ?? ivScore ?? 0

  let label: PotentialRating['label'] = 'Baixo'
  let tone: PotentialRating['tone'] = 'low'

  if (hasQuality && hasIv) {
    const exceptionalIv = quality >= 3 ? 145 : quality >= 2 ? 155 : 165
    const isExceptional = quality >= 1.7 && iv >= exceptionalIv && score >= 0.82
    const isGreat = score >= 0.72 && (
      (quality >= 3 && iv >= 115) ||
      (quality >= 2 && iv >= 125) ||
      (quality >= 1.7 && iv >= 135) ||
      (quality >= 1.5 && iv >= 150)
    )
    const isGood = score >= 0.58 && quality >= 1.3 && iv >= 90
    const isRegular = score >= 0.38 && quality >= 1.1 && iv >= 55

    if (isExceptional) { label = 'Excepcional'; tone = 'exceptional' }
    else if (isGreat) { label = 'Ótimo'; tone = 'great' }
    else if (isGood) { label = 'Bom'; tone = 'good' }
    else if (isRegular) { label = 'Regular'; tone = 'regular' }
  } else {
    if (score >= 0.68) { label = 'Ótimo'; tone = 'great' }
    else if (score >= 0.48) { label = 'Bom'; tone = 'good' }
    else if (score >= 0.25) { label = 'Regular'; tone = 'regular' }
  }

  const statValues = pokemon.stats ? Object.values(pokemon.stats) : []
  const completeStats = statValues.length === 6 && statValues.every((value) => Number.isFinite(value))
  const level = Number(pokemon.level)
  const hasLevel = Number.isFinite(level)
  const confidence = !hasQuality || !hasIv || !completeStats || !hasLevel
    ? 'insufficient'
    : level < 15
      ? 'preliminary'
      : 'high'

  const confidenceDetails = confidence === 'high'
    ? {
        confidenceLabel: 'Alta confiança' as const,
        confidenceReason: 'Nível 15 ou superior, IV, Quality e os seis stats disponíveis.'
      }
    : confidence === 'preliminary'
      ? {
          confidenceLabel: 'Estimativa preliminar' as const,
          confidenceReason: 'Abaixo do nível 15, os stats ainda variam demais para uma validação precisa.'
        }
      : {
          confidenceLabel: 'Dados insuficientes' as const,
          confidenceReason: 'Abra os detalhes do Pokémon para receber nível, IV, Quality e os seis stats.'
        }

  return {
    score,
    label,
    tone,
    qualityScore,
    ivScore,
    power: calculatedPower(pokemon),
    confidence,
    ...confidenceDetails
  }
}

export function strongestStat(stats: PokemonStats | undefined): { name: string; value: number } | null {
  if (!stats) return null
  const labels: Array<[keyof PokemonStats, string]> = [
    ['hp', 'HP'], ['attack', 'Ataque'], ['defense', 'Defesa'],
    ['specialAttack', 'Ataque Especial'], ['specialDefense', 'Defesa Especial'], ['speed', 'Velocidade']
  ]
  return labels.map(([key, name]) => ({ name, value: stats[key] })).sort((left, right) => right.value - left.value)[0]
}