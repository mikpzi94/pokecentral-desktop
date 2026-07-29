import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const ROOT = "C:/Users/MikPz/Desktop/IA/PROJETO POKE IDLE WOLRD SITE/pokecentral-desktop";
const TMP = path.join(ROOT, ".tmp-presentation");
const ASSETS = path.join(TMP, "current-captures");
const OUT = path.join(ROOT, "docs");
const FINAL = path.join(OUT, "PokeCentral-Desktop-Apresentacao-v2.pptx");

const W = 1280;
const H = 720;
const C = {
  bg: "#12100c",
  panel: "#1c1812",
  panel2: "#26201a",
  border: "#4a3c28",
  borderHi: "#6b5637",
  gold: "#f0b429",
  green: "#8fc45a",
  blue: "#4a90c2",
  purple: "#a878c4",
  red: "#d4593f",
  text: "#f2e8d5",
  muted: "#a89880",
  dim: "#736450",
};

async function imageBytes(file) {
  const bytes = await fs.readFile(file);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function shape(slide, x, y, w, h, fill = "none", lineFill = "none", lineWidth = 0, name) {
  return slide.shapes.add({
    geometry: "rect",
    name,
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: "solid", fill: lineFill, width: lineWidth },
  });
}

function text(slide, value, x, y, w, h, size = 20, color = C.text, opts = {}) {
  const box = shape(slide, x, y, w, h, opts.fill ?? "none", opts.lineFill ?? "none", opts.lineWidth ?? 0, opts.name);
  box.text = value;
  box.text.fontSize = size;
  box.text.color = color;
  box.text.bold = Boolean(opts.bold);
  box.text.typeface = opts.mono ? "Courier New" : "Aptos";
  box.text.alignment = opts.align ?? "left";
  box.text.verticalAlignment = opts.valign ?? "top";
  box.text.insets = opts.insets ?? { left: 0, right: 0, top: 0, bottom: 0 };
  return box;
}

function base(slide, section, number, accent = C.gold) {
  slide.background.fill = C.bg;
  shape(slide, 0, 0, W, 8, accent);
  shape(slide, 44, 40, 3, 640, C.border);
  text(slide, section.toUpperCase(), 68, 34, 470, 26, 14, accent, { bold: true, mono: true });
  text(slide, String(number).padStart(2, "0"), 1168, 34, 46, 26, 14, C.dim, { bold: true, mono: true, align: "right" });
  shape(slide, 68, 666, 1144, 1, C.border);
  text(slide, "POKECENTRAL DESKTOP  •  APRESENTAÇÃO DO PRODUTO", 68, 680, 680, 18, 11, C.dim, { mono: true });
}

function title(slide, value, subtitle, accent = C.gold) {
  text(slide, value, 68, 78, 1144, 60, 38, C.text, { bold: true, mono: true });
  if (subtitle) text(slide, subtitle, 68, 142, 1100, 46, 18, C.muted);
  shape(slide, 68, 194, 94, 5, accent);
}

async function screenshot(slide, file, x, y, w, h, alt, accent = C.borderHi, fit = "contain") {
  shape(slide, x - 8, y - 8, w + 16, h + 16, C.panel2, accent, 2);
  slide.images.add({
    blob: await imageBytes(file),
    contentType: "image/png",
    alt,
    fit,
    position: { left: x, top: y, width: w, height: h },
  });
}

function note(slide, sources) {
  slide.speakerNotes.textFrame.setText(
    `[Sources]\n${sources.map((source) => `- ${source}`).join("\n")}\n[/Sources]`
  );
}

const deck = Presentation.create({ slideSize: { width: W, height: H } });

// 1 — Capa
{
  const slide = deck.slides.add();
  slide.background.fill = C.bg;
  shape(slide, 0, 0, W, 10, C.gold);
  shape(slide, 62, 66, 4, 586, C.borderHi);
  shape(slide, 94, 94, 116, 116, C.panel2, C.borderHi, 2);
  slide.images.add({
    blob: await imageBytes(path.join(ROOT, "src/renderer/public/icons/logo.png")),
    contentType: "image/png",
    alt: "Logotipo PokeCentral Desktop",
    fit: "contain",
    position: { left: 114, top: 114, width: 76, height: 76 },
  });
  text(slide, "POKECENTRAL", 94, 246, 1040, 78, 58, C.text, { bold: true, mono: true });
  text(slide, "DESKTOP", 94, 318, 700, 58, 40, C.gold, { bold: true, mono: true });
  text(slide, "Contas, inventário e análise em uma central local.", 96, 416, 900, 44, 24, C.muted);
  text(slide, "Launcher independente para Windows  •  versão 0.12.1", 96, 486, 820, 30, 16, C.green, { mono: true });
  text(slide, "Ferramenta complementar. Não automatiza ações dentro do jogo.", 96, 590, 1000, 26, 16, C.dim);
  note(slide, [
    `${ROOT}/CONTEXTO_POKECENTRAL_DESKTOP.txt`,
    `${ROOT}/src/renderer/public/icons/logo.png`,
  ]);
}

// 2 — Problema
{
  const slide = deck.slides.add();
  base(slide, "Visão", 2, C.gold);
  title(slide, "Quatro contas não precisam virar quatro rotinas.", "O aplicativo reúne o que hoje exige alternância, conferência e organização manual.");
  text(slide, "O jogador continua jogando.\nO PokeCentral organiza ao redor.", 68, 244, 500, 128, 30, C.text, { bold: true });
  const items = [
    ["01", "SESSÕES", "Até quatro logins isolados, preservados ao trocar de tela.", C.green],
    ["02", "INVENTÁRIO", "Pokémon, Pokébolas e itens consolidados em um único lugar.", C.blue],
    ["03", "DECISÃO", "Análise, preço sugerido e compartilhamento somente quando solicitado.", C.purple],
  ];
  items.forEach(([n, label, body, color], index) => {
    const y = 232 + index * 126;
    text(slide, n, 650, y, 58, 34, 22, color, { bold: true, mono: true });
    text(slide, label, 726, y, 430, 30, 18, C.text, { bold: true, mono: true });
    text(slide, body, 726, y + 38, 460, 54, 17, C.muted);
    shape(slide, 650, y + 102, 536, 1, C.border);
  });
  note(slide, [`${ROOT}/CONTEXTO_POKECENTRAL_DESKTOP.txt`]);
}

// 3 — Launcher
{
  const slide = deck.slides.add();
  base(slide, "Launcher", 3, C.green);
  title(slide, "Todas as contas permanecem visíveis e independentes.", "Grade 2×2 por padrão; qualquer sessão pode ser ampliada sem perder o estado.", C.green);
  await screenshot(slide, path.join(ASSETS, "launcher-current.png"), 68, 218, 890, 418, "Grade 2x2 do launcher", C.green, "cover");
  text(slide, "4", 1000, 244, 150, 70, 54, C.green, { bold: true, mono: true });
  text(slide, "SESSÕES\nISOLADAS", 1000, 318, 190, 62, 18, C.text, { bold: true, mono: true });
  shape(slide, 1000, 402, 190, 2, C.borderHi);
  text(slide, "• login persistente\n• conta por cor\n• grade ou foco\n• menu recolhível", 1000, 426, 210, 132, 17, C.muted);
  note(slide, [
    `${ROOT}/CONTEXTO_POKECENTRAL_DESKTOP.txt`,
    `${ASSETS}/launcher-current.png — captura direta da versão atual do aplicativo`,
  ]);
}

// 4 — Inventário
{
  const slide = deck.slides.add();
  base(slide, "Inventário", 4, C.green);
  title(slide, "Um inventário único reduz procura e comparação manual.", "Filtros por conta, nível, IV, raridade e shiny ajudam a encontrar o que importa.", C.green);
  await screenshot(slide, path.join(ASSETS, "inventory-current.png"), 68, 216, 1144, 354, "Inventário unificado do PokeCentral Desktop", C.green, "cover");
  const labels = ["Tudo", "Pokémon", "Pokébolas", "Itens"];
  labels.forEach((label, index) => {
    const x = 68 + index * 286;
    text(slide, label.toUpperCase(), x, 592, 248, 26, 16, index === 0 ? C.gold : C.text, { bold: true, mono: true, align: "center" });
  });
  note(slide, [
    `${ROOT}/CONTEXTO_POKECENTRAL_DESKTOP.txt`,
    `${ASSETS}/inventory-current.png — captura direta da versão atual do aplicativo`,
  ]);
}

// 5 — Laboratório
{
  const slide = deck.slides.add();
  base(slide, "Laboratório", 5, C.blue);
  title(slide, "A análise transforma números em uma leitura prática.", "Quality, IV, Power e seis atributos aparecem juntos, com potencial apresentado como estimativa.", C.blue);
  await screenshot(slide, path.join(ASSETS, "laboratory-current.png"), 68, 214, 760, 426, "Laboratório de análise de Pokémon", C.blue, "contain");
  text(slide, "A LEITURA REÚNE", 870, 228, 300, 28, 16, C.blue, { bold: true, mono: true });
  text(slide, "Raridade\nIV total\nQuality\nPower atual\nSeis atributos\nPotencial estimado", 870, 278, 310, 244, 22, C.text, { bold: true });
  text(slide, "A classificação auxilia a triagem; não substitui uma medição oficial do jogo.", 870, 548, 300, 76, 16, C.muted);
  note(slide, [
    `${ROOT}/CONTEXTO_POKECENTRAL_DESKTOP.txt`,
    `${ASSETS}/laboratory-current.png — captura direta da versão atual do aplicativo`,
  ]);
}

// 6 — Vitrine
{
  const slide = deck.slides.add();
  base(slide, "Vitrine", 6, C.purple);
  title(slide, "O anúncio nasce local e só sai quando o jogador decide.", "Preço sugerido, contatos e compartilhamento ficam sob ação explícita do usuário.", C.purple);
  await screenshot(slide, path.join(ASSETS, "showcase-current.png"), 68, 214, 810, 424, "Vitrine local e criação de anúncios", C.purple, "cover");
  const actions = [
    ["1", "CRIAR", "Selecionar o Pokémon e decidir o preço."],
    ["2", "REVISAR", "Confirmar dados, contato e negociação."],
    ["3", "COMPARTILHAR", "Copiar imagem ou gerar link temporário."],
  ];
  actions.forEach(([n, label, body], i) => {
    const y = 226 + i * 128;
    text(slide, n, 922, y, 38, 34, 22, C.purple, { bold: true, mono: true });
    text(slide, label, 978, y, 220, 26, 16, C.text, { bold: true, mono: true });
    text(slide, body, 978, y + 36, 220, 60, 16, C.muted);
  });
  note(slide, [
    `${ROOT}/CONTEXTO_POKECENTRAL_DESKTOP.txt`,
    `${ASSETS}/showcase-current.png — captura direta da versão atual do aplicativo`,
  ]);
}

// 7 — Limites
{
  const slide = deck.slides.add();
  base(slide, "Princípios", 7, C.gold);
  title(slide, "O jogador permanece no controle de cada ação.", "A proposta é organizar informações — nunca substituir a interação humana com o jogo.");
  text(slide, "O APLICATIVO FAZ", 88, 236, 460, 32, 20, C.green, { bold: true, mono: true });
  text(slide, "O APLICATIVO NÃO FAZ", 696, 236, 470, 32, 20, C.red, { bold: true, mono: true });
  shape(slide, 640, 228, 2, 376, C.borderHi);
  text(slide, "✓ abre sessões separadas\n✓ organiza dados da própria conta\n✓ consolida inventário\n✓ calcula indicadores locais\n✓ compartilha quando solicitado", 88, 296, 500, 266, 22, C.text);
  text(slide, "× não clica nem movimenta\n× não caça nem captura\n× não executa macros\n× não lê memória do processo\n× não coleta senha ou token", 696, 296, 500, 266, 22, C.text);
  text(slide, "SEM AUTOMAÇÃO DE GAMEPLAY", 88, 584, 1098, 40, 22, C.gold, { bold: true, mono: true, align: "center" });
  note(slide, [`${ROOT}/CONTEXTO_POKECENTRAL_DESKTOP.txt`]);
}

// 8 — Segurança
{
  const slide = deck.slides.add();
  base(slide, "Segurança", 8, C.blue);
  title(slide, "Privacidade local é o comportamento padrão.", "As sessões do jogo ficam separadas das funções internas do desktop.", C.blue);
  const bands = [
    ["SESSÕES", "Cada conta usa uma partição persistente própria.", C.green],
    ["COLETA", "Somente informações recebidas pela sessão autenticada do jogador.", C.blue],
    ["ARMAZENAMENTO", "Inventário, anúncios e contatos permanecem no computador.", C.purple],
    ["COMPARTILHAMENTO", "Somente após comando claro; links temporários e dados limitados.", C.gold],
  ];
  bands.forEach(([label, body, color], i) => {
    const y = 224 + i * 96;
    shape(slide, 88, y, 8, 66, color);
    text(slide, label, 122, y, 250, 28, 18, color, { bold: true, mono: true });
    text(slide, body, 384, y, 770, 52, 20, C.text);
    shape(slide, 122, y + 76, 1032, 1, C.border);
  });
  text(slide, "nodeIntegration desativado  •  isolamento de contexto  •  sandbox  •  navegação restrita", 88, 610, 1090, 24, 15, C.dim, { mono: true, align: "center" });
  note(slide, [
    `${ROOT}/CONTEXTO_POKECENTRAL_DESKTOP.txt`,
    `${ROOT}/src/main/index.ts`,
    `${ROOT}/src/preload/index.ts`,
  ]);
}

// 9 — Transparência
{
  const slide = deck.slides.add();
  base(slide, "Confiança", 9, C.green);
  title(slide, "Transparência não exige publicar o código do produto.", "A página pública pode oferecer evidências verificáveis sem expor a lógica comercial.", C.green);
  const left = [
    "Política de privacidade em linguagem clara",
    "Mapa dos dados acessados e onde ficam",
    "Histórico público de versões e correções",
  ];
  const right = [
    "Hash do instalador e análise antivírus",
    "Canal responsável para suporte e segurança",
    "Demonstração real das principais funções",
  ];
  left.forEach((item, i) => {
    text(slide, "✓", 92, 246 + i * 102, 34, 34, 24, C.green, { bold: true });
    text(slide, item, 142, 244 + i * 102, 430, 64, 20, C.text);
  });
  right.forEach((item, i) => {
    text(slide, "✓", 666, 246 + i * 102, 34, 34, 24, C.green, { bold: true });
    text(slide, item, 716, 244 + i * 102, 450, 64, 20, C.text);
  });
  shape(slide, 88, 566, 1080, 2, C.borderHi);
  text(slide, "Identidade própria  •  descrição precisa  •  nenhuma alegação de produto oficial", 88, 590, 1080, 34, 18, C.gold, { bold: true, mono: true, align: "center" });
  note(slide, [
    `${ROOT}/CONTEXTO_POKECENTRAL_DESKTOP.txt`,
    "https://www.gov.br/mdr/pt-br/acesso-a-informacao/perguntas-frequentes/perguntas-e-respostas-frequentes-sobre-lgpd/quais-principios-devem-nortear-o",
  ]);
}

// 10 — Próximo passo
{
  const slide = deck.slides.add();
  base(slide, "Próximo passo", 10, C.gold);
  title(slide, "O próximo marco é uma beta pequena e verificável.", "A evolução comercial acontece depois de validar instalação, segurança e entendimento do usuário.");
  const phases = [
    ["01", "VALIDAR", "Instalação limpa\nLinks e contatos\nPersistência das sessões", C.green],
    ["02", "TESTAR", "Grupo pequeno\nFeedback documentado\nCorreções prioritárias", C.blue],
    ["03", "PUBLICAR", "Página do produto\nPrivacidade e termos\nDownload verificável", C.purple],
    ["04", "LANÇAR", "Licença de uso\nSuporte definido\nAtualizações controladas", C.gold],
  ];
  phases.forEach(([n, label, body, color], i) => {
    const x = 68 + i * 286;
    text(slide, n, x, 246, 64, 38, 24, color, { bold: true, mono: true });
    shape(slide, x, 294, 238, 4, color);
    text(slide, label, x, 322, 238, 34, 18, C.text, { bold: true, mono: true });
    text(slide, body, x, 382, 238, 142, 18, C.muted);
  });
  text(slide, "PokeCentral Desktop", 68, 584, 610, 34, 24, C.text, { bold: true, mono: true });
  text(slide, "Uma central local para organizar antes de compartilhar.", 68, 622, 930, 28, 18, C.gold);
  note(slide, [`${ROOT}/CONTEXTO_POKECENTRAL_DESKTOP.txt`]);
}

await fs.mkdir(OUT, { recursive: true });
await fs.mkdir(path.join(TMP, "rendered"), { recursive: true });

for (const [index, slide] of deck.slides.items.entries()) {
  const stem = `slide-${String(index + 1).padStart(2, "0")}`;
  const png = await deck.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(path.join(TMP, "rendered", `${stem}.png`), new Uint8Array(await png.arrayBuffer()));
  const layout = await slide.export({ format: "layout" });
  await fs.writeFile(path.join(TMP, "rendered", `${stem}.layout.json`), await layout.text());
}

const montage = await deck.export({ format: "webp", montage: true, scale: 1 });
await fs.writeFile(path.join(TMP, "rendered", "montage.webp"), new Uint8Array(await montage.arrayBuffer()));
await fs.writeFile(
  path.join(TMP, "deck-inspect.ndjson"),
  (await deck.inspect({ kind: "slide,textbox,shape,image,notes", maxChars: 50000 })).ndjson,
  "utf8",
);

const pptx = await PresentationFile.exportPptx(deck);
await pptx.save(FINAL);
console.log(FINAL);
