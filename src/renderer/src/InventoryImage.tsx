import { useEffect, useState } from 'react'

type Props = {
  src?: string
  alt: string
  className?: string
}

export function pokemonSpriteUrl(speciesId: number | undefined, shiny = false): string | undefined {
  if (!speciesId) return undefined
  const variant = shiny ? 'shiny/' : ''
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${variant}${speciesId}.png`
}

export function itemImageUrl(icon: string | undefined, name?: string): string | undefined {
  if (icon && /^https?:\/\//i.test(icon)) return icon
  if (icon) return `https://poke.idleworld.online${icon.startsWith('/') ? '' : '/'}${icon}`
  if (!name) return undefined
  const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${slug}.png`
}

export default function InventoryImage({ src, alt, className = '' }: Props): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  if (!src || failed) return <span className={`inventory-image fallback ${className}`} aria-hidden="true">{alt.slice(0, 1).toUpperCase()}</span>
  return <img className={`inventory-image ${className}`} src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
}