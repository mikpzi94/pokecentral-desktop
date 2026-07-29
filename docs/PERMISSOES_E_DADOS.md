# Permissões, dados e conexões — PokeCentral Desktop

Atualizado em: 24/07/2026

Este documento descreve os dados utilizados pela versão 0.12.3 e quando eles podem sair do computador.

## Dados tratados localmente

| Dado | Finalidade | Armazenamento | Enviado automaticamente? |
|---|---|---|---|
| Nome e slot da conta | Identificar sessões | Local | Não |
| Nome do personagem | Identificar o inventário | Local | Não |
| Pokémon e identificadores | Inventário e vitrine | Local | Não |
| Nível, IV e Quality | Filtros e análise | Local | Não |
| Seis stats e Power | Laboratório e card | Local | Não |
| Pokébolas e itens | Inventário consolidado | Local | Não |
| Preço e negociação | Anúncio local | Local | Não |
| WhatsApp e Discord | Contato escolhido | Local | Não |
| Cookies da sessão | Manter login no jogo | Partição do Electron | Somente para o próprio domínio do jogo |

## Senhas e autenticação do jogo

A senha é digitada diretamente na página do jogo. O PokeCentral Desktop não copia a senha para o painel, não a inclui no inventário e não a envia aos servidores do PokeCentral. Cookies e dados de sessão permanecem nas partições locais usadas pelo navegador incorporado.

## Quando dados podem sair do computador

### Acesso ao jogo

As sessões se comunicam com os domínios do jogo para autenticação e funcionamento normal.

### Imagens

O aplicativo pode carregar imagens do próprio jogo e do repositório público de sprites da PokeAPI.

### Link compartilhável

Somente após a ação do usuário, o link pode incluir espécie, nível, IV, Quality, raridade, potencial, Power, stats, preço, nome do personagem e contato escolhido. O conteúdo é codificado no endereço, não criptografado.

### Imagem copiada

A imagem do anúncio é gerada localmente e colocada na área de transferência. O aplicativo não a envia automaticamente.

## Domínios utilizados

| Domínio | Uso |
|---|---|
| `poke.idleworld.online` | Jogo, login, dados e imagens fornecidas pela sessão |
| `idleworld.online` | Navegação permitida do serviço do jogo |
| `raw.githubusercontent.com/PokeAPI` | Sprites de Pokémon e itens |
| `pokecentral-rmt.vercel.app` | Página temporária de compartilhamento quando o link é aberto |
| `wa.me` / `api.whatsapp.com` / `web.whatsapp.com` | Abrir contato escolhido pelo usuário |
| `discord.com` | Abrir perfil pelo ID informado pelo usuário |

## Dados que não devem ser coletados

- senha do jogo;
- token de autenticação;
- conteúdo de outras páginas ou aplicativos;
- arquivos pessoais fora de uma seleção explícita;
- histórico geral do navegador;
- informações de outras pessoas que não sejam necessárias ao anúncio;
- dados de pagamento dentro do aplicativo sem provedor e política próprios.

## Exclusão

Inventário, anúncios e contatos podem ser removidos do armazenamento local. Uma futura tela de privacidade deve oferecer uma ação única para apagar dados do painel sem depender da desinstalação.

## Alterações futuras

Login do PokeCentral, pagamentos, telemetria, atualização automática ou publicação no marketplace exigirão revisão deste documento antes da implementação e consentimento compatível com a finalidade.