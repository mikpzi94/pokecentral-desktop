import { z } from 'zod'
import type { Pokemon } from '../../../shared/types'

const recordSchema = z.object({
  species: z.string().min(1),
  level: z.coerce.number().int().positive().optional(),
  quality: z.string().optional(),
  iv: z.coerce.number().min(0).max(100).optional(),
  shiny: z.union([z.boolean(), z.string()]).optional(),
  power: z.coerce.number().nonnegative().optional(),
  notes: z.string().optional()
})

type RawRecord = z.infer<typeof recordSchema>

function makePokemon(record: RawRecord, accountId: string, sourceName: string): Pokemon {
  const shiny =
    typeof record.shiny === 'boolean'
      ? record.shiny
      : ['sim', 'yes', 'true', '1'].includes((record.shiny ?? '').toLowerCase())

  return {
    id: crypto.randomUUID(),
    accountId,
    species: record.species.trim(),
    level: record.level,
    quality: record.quality?.trim() || undefined,
    iv: record.iv,
    shiny,
    power: record.power,
    notes: record.notes?.trim() || undefined,
    source: 'file',
    sourceName,
    importedAt: new Date().toISOString()
  }
}

export function parseJsonInventory(content: string, accountId: string, sourceName: string): Pokemon[] {
  const raw: unknown = JSON.parse(content)
  const rows = Array.isArray(raw)
    ? raw
    : typeof raw === 'object' && raw !== null && Array.isArray((raw as { pokemon?: unknown }).pokemon)
      ? (raw as { pokemon: unknown[] }).pokemon
      : null

  if (!rows) throw new Error('O JSON deve ser uma lista ou conter uma lista chamada "pokemon".')
  return rows.map((row) => makePokemon(recordSchema.parse(normalizeKeys(row)), accountId, sourceName))
}

export function parseCsvInventory(content: string, accountId: string, sourceName: string): Pokemon[] {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim())
  if (lines.length < 2) throw new Error('O CSV precisa ter cabeçalho e ao menos uma linha.')

  const delimiter = lines[0].includes(';') ? ';' : ','
  const headers = splitCsvLine(lines[0], delimiter).map((value) => normalizeKey(value))

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line, delimiter)
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
    return makePokemon(recordSchema.parse(row), accountId, sourceName)
  })
}

function normalizeKeys(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [normalizeKey(key), entry])
  )
}

function normalizeKey(key: string): string {
  const normalized = key
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, '')

  const aliases: Record<string, string> = {
    pokemon: 'species',
    nome: 'species',
    especie: 'species',
    nivel: 'level',
    qualidade: 'quality',
    poder: 'power',
    observacoes: 'notes',
    notas: 'notes',
    brilhante: 'shiny'
  }
  return aliases[normalized] ?? normalized
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = []
  let current = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (char === delimiter && !quoted) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  values.push(current.trim())
  return values
}
