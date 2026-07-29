import speciesData from '../data/pricing-species.json'
import type { Pokemon } from '../../../shared/types'

type PricingSpecies = {
  name: string
  bst: number
  finalBst: number
  priceNpc: number
  rarity: string
}

export type PriceSuggestion = {
  quick: number
  recommended: number
  flexible: number
  confidence: 'base'
}

const species = speciesData as PricingSpecies[]
const byName = new Map(species.map((entry) => [normalizeName(entry.name), entry]))

const config = {
  breakpointIv: 150,
  baseIv: 120,
  basePrice: 10,
  ivRate: 0.018,
  ivTailRate: 0.022,
  qualityBase: 1.75,
  qualityWeight: 3,
  shinyMultiplier: 1.6,
  shinyPremium: 15,
  levelScale: 10,
  levelReference: 350,
  levelExponent: 1.7,
  levelCap: 12
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum))
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase()
    .replace(/^(brave|furious|enraged|ancient|tribal|war|enigmatic|charged|magnetic|evil|freezing|psy|heavy|roll|hard|brute|dark|trickmaster|banshee|taekwondo)\s+/, '')
    .replace(/^milch-/, '')
}

function ivFactor(value: number): number {
  const iv = clamp(value, 0, 192)
  if (iv <= config.breakpointIv) return Math.exp((iv - config.baseIv) * config.ivRate)
  const untilBreakpoint = Math.exp((config.breakpointIv - config.baseIv) * config.ivRate)
  return untilBreakpoint * Math.exp((iv - config.breakpointIv) * config.ivTailRate)
}

function qualityFactor(value: number): number {
  return Math.pow(Math.max(value, 0.1) / config.qualityBase, config.qualityWeight)
}

function levelBonus(value: number): number {
  const level = Math.max(value, 1)
  const bonus = config.levelScale * Math.pow(Math.max(level - 1, 0) / config.levelReference, config.levelExponent)
  return Math.min(bonus, config.levelCap)
}

function speciesFactor(name: string, shiny: boolean): number {
  const entry = byName.get(normalizeName(name))
  if (!entry) return 1
  const bst = shiny ? entry.bst : entry.finalBst || entry.bst
  const strength = clamp(Math.pow(bst / 500, 0.55), 0.88, 1.18)
  const economy = entry.priceNpc > 0 ? clamp(Math.pow(entry.priceNpc / 18000, 0.18), 0.7, 1.3) : 1
  const rarity = ({ COMMON: 1, UNCOMMON: 1.03, RARE: 1.07, EPIC: 1.15, LEGENDARY: 1.3 } as Record<string, number>)[entry.rarity.toUpperCase()] ?? 1
  return clamp(strength * economy * rarity, 0.65, 1.6)
}

function roundHalf(value: number): number {
  return Math.round(value * 2) / 2
}

export function suggestPokemonPrice(pokemon: Pokemon): PriceSuggestion {
  const iv = Number.isFinite(pokemon.iv) ? pokemon.iv! : config.baseIv
  const qualityValue = Number(pokemon.quality)
  const quality = Number.isFinite(qualityValue) ? qualityValue : config.qualityBase
  const level = Number.isFinite(pokemon.level) ? pokemon.level! : 1
  const shinyMultiplier = pokemon.shiny ? config.shinyMultiplier : 1
  const shinyPremium = pokemon.shiny ? config.shinyPremium : 0
  const model =
    config.basePrice *
      ivFactor(iv) *
      qualityFactor(quality) *
      shinyMultiplier *
      speciesFactor(pokemon.species, pokemon.shiny) +
    shinyPremium +
    levelBonus(level)

  return {
    quick: roundHalf(model * 0.85),
    recommended: roundHalf(model),
    flexible: roundHalf(model * 1.15),
    confidence: 'base'
  }
}

