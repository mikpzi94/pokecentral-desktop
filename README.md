# PokeCentral Desktop

Launcher local para organizar até quatro contas, Pokémon, Pokébolas e itens. O aplicativo não automatiza gameplay: não clica, captura, vende, negocia ou toma decisões dentro do jogo.

## Estado atual

- Até quatro navegadores persistentes e isolados.
- Menu lateral enxuto com Telas, Inventário, Laboratório e Vitrine; a grade 2×2 é o padrão e cada janela pode ser ampliada ou retornar à grade.
- Cores fixas para identificar cada conta.
- Zoom separado por conta e modo, preservado entre reinicializações; 100% e 70% continuam como padrões.
- Ultra Ball e Idle Ball visíveis no cabeçalho de cada conta, com alerta de estoque baixo.
- Atalhos Ctrl+1–4 para contas, Ctrl+0/Esc para grade e Ctrl+R para recarregar.
- Detecção conservadora de página sem resposta, com aviso e recarga somente após confirmação do usuário.
- Gerenciamento de contas em painel próprio, sem repetir as contas no menu principal.
- Sincronização local de Pokémon, stats, Pokébolas e itens recebidos pela sessão.
- Inventário com abas Tudo, Pokémon, Pokébolas e Itens.
- Filtros por conta, nível mínimo e máximo, IV total, Quality e shiny.
- Raridade oficial por Quality: Fraco a Divino.
- Laboratório para análise de Quality, IV, Power e distribuição dos seis stats.
- Vitrine preserva o inventário ao adicionar vários anúncios, usa códigos permanentes por conta (`AC1-001`) que nunca são reutilizados, gera catálogos de até seis anúncios por imagem e oferece revisão opcional de preço após cinco dias.
- Leitor compatível com recipientes de tokens e com o Bronze Boss Token.
- Instalador NSIS por usuário, sem exigir administrador.

## Análise de potencial

A raridade usa as faixas de Quality adotadas pelo projeto. O indicador de Potencial é uma estimativa independente do PokeCentral para triagem: Quality recebe 55% do peso e IV total 45%. Quando os seis stats estão disponíveis, Power é calculado por `(HP + Ataque + Defesa + Ataque Especial + Defesa Especial + Velocidade) × Quality`. A confiança da leitura é exibida separadamente: dados incompletos são marcados como insuficientes, Pokémon abaixo do nível 15 recebem estimativa preliminar e Pokémon de nível 15 ou superior com os seis stats recebem alta confiança.

O catálogo compacto de espécies, atributos base e itens é gerado a partir dos arquivos públicos oficiais `game/creatures.json` e `game/items.json`.

## Sincronização

O leitor observa somente dados recebidos pela sessão oficial já aberta pelo usuário. Ele não envia comandos privados ao jogo e não coleta cookies, senhas ou tokens.

- Abra a box para sincronizar Pokémon.
- Abra os detalhes de um Pokémon para receber os seis stats, quando enviados pelo jogo.
- Abra Pokébolas ou suprimentos para sincronizar Pokébolas.
- Abra a mochila/inventário de itens para sincronizar os demais itens.

## Segurança e dados

- [Segurança e transparência](docs/SEGURANCA_E_TRANSPARENCIA.md)
- [Permissões, dados e conexões](docs/PERMISSOES_E_DADOS.md)
- [Solicitação e registro de autorização](docs/SOLICITACAO_DE_AUTORIZACAO.md)

## Desenvolvimento

```powershell
npm install
npm run typecheck
npm run build
npm run dist:win
```

## Limites de segurança

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- sessões persistentes separadas por conta
- navegação principal limitada aos hosts oficiais configurados
- nenhum cookie, senha ou token é exposto ao inventário
- nenhuma automação de ações dentro do jogo