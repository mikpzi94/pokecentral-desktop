# Segurança e transparência — PokeCentral Desktop

Atualizado em: 24/07/2026

O PokeCentral Desktop é uma ferramenta independente para Windows. Ele organiza sessões, inventário, análises e anúncios do próprio jogador. Não é bot e não executa ações de gameplay.

## O que o aplicativo faz

- Abre até quatro sessões separadas do jogo.
- Mantém cada login em uma partição local independente.
- Organiza Pokémon, Pokébolas e itens recebidos pela própria sessão.
- Calcula indicadores locais de raridade, potencial, Power e preço sugerido.
- Cria anúncios locais e materiais de compartilhamento somente por solicitação.

## O que o aplicativo não faz

- Não movimenta o personagem.
- Não batalha, caça, captura ou vende automaticamente.
- Não executa macros ou auto-click.
- Não lê memória de outros processos.
- Não copia senhas, cookies ou tokens para o painel.
- Não publica anúncios automaticamente.
- Não envia o inventário completo para o PokeCentral por padrão.

## Proteções técnicas atuais

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webSecurity: true`
- conteúdo inseguro bloqueado
- API de integração pequena e explícita
- validação dos dados recebidos entre processos
- navegação do jogo limitada a domínios autorizados
- links externos limitados a HTTPS e destinos conhecidos
- sessões do jogo separadas das APIs internas do desktop

## Armazenamento local

Contas configuradas, inventário, anúncios e contatos ficam no computador do usuário. As sessões do jogo são armazenadas nas partições locais do Electron. Desinstalar o programa não apaga esses dados automaticamente na versão atual.

## Compartilhamento

Criar um anúncio não o publica no site. Quando o usuário escolhe gerar um link, uma cópia limitada dos dados públicos do anúncio é colocada no próprio endereço compartilhável.

Essa codificação não é criptografia. Qualquer pessoa que possuir o link deve ser tratada como capaz de visualizar os dados do anúncio e o contato escolhido. Não coloque no anúncio informações que não devam se tornar públicas.

## Verificação de versões

Cada versão pública deve possuir:

- número de versão e changelog;
- hash SHA-256 do instalador;
- resultado de análise antivírus;
- data de publicação;
- canal para relatar vulnerabilidades;
- descrição de alterações relacionadas a dados e permissões.

## Código e auditoria

O código principal do produto é privado. Isso protege o modelo comercial, mas não substitui transparência. A estratégia prevista é fornecer documentação técnica pública, builds verificáveis e acesso privado para auditorias independentes ou avaliação da administração do jogo.

## Limitações conhecidas

- O instalador ainda precisa de uma estratégia definitiva de assinatura de código.
- Links públicos temporários não são apropriados para dados confidenciais.
- A análise de potencial é independente e não deve ser apresentada como medição oficial.
- Resultados baseados em stats abaixo do nível 15 são exibidos como estimativa preliminar.
- A compatibilidade depende de estruturas fornecidas pelo jogo e pode exigir ajustes após atualizações.

## Contato de segurança

Relatos de segurança e solicitações de suporte podem ser enviados para:

`pokecentralrmt@gmail.com`

Relatos não devem ser feitos em canais públicos quando contiverem dados pessoais, credenciais ou instruções de exploração.