const { app, BrowserWindow, ipcMain, nativeImage } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

let controlCalls = []
let copiedPayload = null

app.whenReady().then(async () => {
  for (const channel of ['launcher:hide-layout', 'launcher:update-layout']) ipcMain.handle(channel, () => null)
  ipcMain.handle('launcher:show-layout', () => [])
  ipcMain.handle('launcher:inventory', () => null)
  ipcMain.handle('launcher:control', (_event, slot, action) => { controlCalls.push({ slot, action }); return null })
  ipcMain.handle('share:copy-card', (_event, payload) => { copiedPayload = payload; return null })
  ipcMain.handle('share:open-url', () => null)

  const win = new BrowserWindow({ width: 1500, height: 900, show: false, webPreferences: { preload: path.join(__dirname, '..', 'out', 'preload', 'index.js'), contextIsolation: true, sandbox: true } })
  await win.loadFile(path.join(__dirname, '..', 'out', 'renderer', 'index.html'))
  const now = new Date().toISOString()
  await win.webContents.executeJavaScript(`
    localStorage.setItem('pokecentral.showcase.profile.v1', JSON.stringify({whatsapp:'5511999999999',discordUsername:'motomoto',discordUserId:'123456789012345678',preferredContact:'whatsapp'}));
    localStorage.setItem('pokecentral.desktop.v1', JSON.stringify({
      accounts:[{id:'a1',name:'Conta 1',slot:1,status:'ready',characterName:'MotoMoto'},{id:'a2',name:'Conta 2',slot:2,status:'ready',characterName:'GengarBR'}],
      pokemon:[{id:'typhlosion',accountId:'a1',speciesId:157,species:'Typhlosion',level:1,iv:138,quality:'1.759',shiny:false,power:23,stats:{hp:2,attack:2,defense:2,specialAttack:3,specialDefense:2,speed:2},source:'assisted',importedAt:'${now}'}],
      items:[], listings:[{id:'listing-1',pokemonId:'typhlosion',accountId:'a1',pokemon:{id:'typhlosion',accountId:'a1',speciesId:157,species:'Typhlosion',level:1,iv:138,quality:'1.759',shiny:false,power:23,stats:{hp:2,attack:2,defense:2,specialAttack:3,specialDefense:2,speed:2},source:'assisted',importedAt:'${now}'},price:15.5,negotiable:false,status:'active',createdAt:'${now}',updatedAt:'${now}'}]
    }));
  `)
  await win.webContents.reload()
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
  await new Promise(resolve => setTimeout(resolve, 450))

  const controls = await win.webContents.executeJavaScript(`({reloadButtons:document.querySelectorAll('.game-frame-label .frame-reload').length,expandButtons:[...document.querySelectorAll('.game-frame-label button')].filter(button=>button.textContent.includes('AMPLIAR')).length})`)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.game-frame-label .frame-reload')[1].click()`)
  await new Promise(resolve => setTimeout(resolve, 100))

  await win.webContents.executeJavaScript(`document.querySelector('[title="Vitrine"]').click()`)
  await new Promise(resolve => setTimeout(resolve, 250))
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('.showcase-actions button')].find(button=>button.textContent.includes('Copiar imagem')).click()`)
  for (let i = 0; i < 50 && !copiedPayload; i++) await new Promise(resolve => setTimeout(resolve, 100))

  const card = copiedPayload?.imageDataUrl ? nativeImage.createFromDataURL(copiedPayload.imageDataUrl) : null
  if (card) fs.writeFileSync(path.join(__dirname, 'share-card-v123.png'), card.toPNG())
  const result = {
    controls,
    controlCalls,
    imageSize: card?.getSize() ?? null,
    hasConfidenceText: copiedPayload?.text?.includes('Estimativa preliminar') ?? false,
    hasImage: !card?.isEmpty()
  }
  fs.writeFileSync(path.join(__dirname, 'smoke-reload-card-v123-result.json'), JSON.stringify(result, null, 2))
  const valid = controls.reloadButtons === 2 && controls.expandButtons === 2 && controlCalls.some(call => call.slot === 2 && call.action === 'reload') && result.imageSize?.width === 1200 && result.imageSize?.height === 630 && result.hasConfidenceText && result.hasImage
  win.destroy()
  app.exit(valid ? 0 : 1)
}).catch(error => { console.error(error); app.exit(1) })