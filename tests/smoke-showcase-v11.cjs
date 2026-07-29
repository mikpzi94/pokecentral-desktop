const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

let copiedPayload = null

app.whenReady().then(async () => {
  for (const channel of ['launcher:hide-layout', 'launcher:update-layout', 'launcher:control']) ipcMain.handle(channel, () => null)
  ipcMain.handle('launcher:show-layout', () => [])
  ipcMain.handle('launcher:inventory', () => null)
  ipcMain.handle('share:copy-card', (_event, payload) => { copiedPayload = payload })
  ipcMain.handle('share:open-url', () => null)

  const win = new BrowserWindow({
    width: 1366,
    height: 850,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'out', 'preload', 'index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })
  await win.loadFile(path.join(__dirname, '..', 'out', 'renderer', 'index.html'))
  await win.webContents.executeJavaScript(`localStorage.setItem('pokecentral.desktop.v1', JSON.stringify({
    accounts:[{id:'a1',name:'Conta 1',slot:1,status:'ready',characterName:'MotoMoto'}],
    pokemon:[{id:'p1',accountId:'a1',speciesId:6,species:'Charizard',level:80,iv:150,quality:'1.8',shiny:false,stats:{hp:220,attack:230,defense:210,specialAttack:280,specialDefense:225,speed:260},source:'assisted',importedAt:new Date().toISOString()}],
    items:[], listings:[]
  }))`)
  await win.webContents.reload()
  await new Promise((resolve) => setTimeout(resolve, 300))
  await win.webContents.executeJavaScript(`document.querySelector('[title="Inventário"]').click()`)
  await new Promise((resolve) => setTimeout(resolve, 180))
  await win.webContents.executeJavaScript(`document.querySelector('.advertise-button').click()`)
  await new Promise((resolve) => setTimeout(resolve, 180))

  const modal = await win.webContents.executeJavaScript(`({
    open: !!document.querySelector('.listing-modal'),
    pokemon: document.querySelector('.listing-pokemon-summary')?.textContent,
    suggestions: [...document.querySelectorAll('.price-options strong')].map((item) => item.textContent),
    price: document.querySelector('.listing-fields input')?.value
  })`)
  await win.webContents.capturePage().then((image) => fs.writeFileSync(path.join(__dirname, 'showcase-editor-v11.png'), image.toPNG()))
  await win.webContents.executeJavaScript(`document.querySelector('.price-options .recommended').click(); document.querySelector('.negotiable-toggle').click()`)
  await new Promise((resolve) => setTimeout(resolve, 120))
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('.listing-modal-actions button')].find((button) => button.textContent.includes('Adicionar')).click()`)
  await new Promise((resolve) => setTimeout(resolve, 250))

  const showcase = await win.webContents.executeJavaScript(`({
    visible: document.querySelector('.showcase-page')?.closest('.dashboard-view')?.classList.contains('active'),
    cards: document.querySelectorAll('.showcase-card').length,
    name: document.querySelector('.showcase-card h2')?.textContent,
    price: document.querySelector('.showcase-price strong')?.textContent,
    negotiable: document.querySelector('.showcase-price span')?.textContent,
    actions: [...document.querySelectorAll('.showcase-actions button')].map((button) => button.textContent),
    saved: JSON.parse(localStorage.getItem('pokecentral.desktop.v1')).listings
  })`)
  await win.webContents.capturePage().then((image) => fs.writeFileSync(path.join(__dirname, 'showcase-page-v11.png'), image.toPNG()))
  await win.webContents.executeJavaScript(`document.querySelector('.share-main').click()`)
  for (let attempt = 0; attempt < 30 && !copiedPayload; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 200))
  const notice = await win.webContents.executeJavaScript(`document.querySelector('.showcase-notice')?.textContent`)

  fs.writeFileSync(path.join(__dirname, 'showcase-v11-result.json'), JSON.stringify({
    modal,
    showcase,
    share: {
      copied: !!copiedPayload,
      hasText: typeof copiedPayload?.text === 'string' && copiedPayload.text.includes('Charizard'),
      hasPlayerName: typeof copiedPayload?.text === 'string' && copiedPayload.text.includes('Jogador: MotoMoto'),
      hasAccountNumber: typeof copiedPayload?.text === 'string' && /Conta\s*[1-4]/.test(copiedPayload.text),
      hasImage: typeof copiedPayload?.imageDataUrl === 'string' && copiedPayload.imageDataUrl.startsWith('data:image/png;base64,'),
      notice
    }
  }, null, 2))
  win.destroy()
  app.exit(0)
}).catch((error) => {
  console.error(error)
  app.exit(1)
})
