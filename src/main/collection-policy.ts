import type { CollectionCapability } from '../shared/types'

/**
 * O leitor observa somente as respostas que o próprio jogo envia à sessão aberta.
 * Não executa cliques, comandos ou automação de gameplay.
 */
export function getCollectionCapability(): CollectionCapability {
  return {
    available: true,
    reason:
      'Leitura local disponível. Abra a caixa ou a lista de Pokémon no jogo para sincronizar a conta automaticamente.'
  }
}