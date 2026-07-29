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

  const win = new BrowserWindow({ width: 1500, height: 900, show: false, webPreferences: { preload: path.join(__dirname, '..', 'out', 'preload', 'index.js'), contextIsolation: true, sandbox: true } })
  await win.loadFile(path.join(__dirname, '..', 'out', 'renderer', 'index.html'))
  const now = new Date().toISOString()
  await win.webContents.executeJavaScript(`
    localStorage.setItem('pokecentral.showcase.profile.v1', JSON.stringify({whatsapp:'5511999999999',discordUsername:'motomoto',discordUserId:'123456789012345678',preferredContact:'whatsapp'}));
    localStorage.setItem('pokecentral.desktop.v1', JSON.stringify({
      accounts:[{id:'a1',name:'Conta 1',slot:1,status:'ready',characterName:'MotoMoto'}],
      pokemon:[{id:'game-a1-pk1',accountId:'a1',speciesId:76,species:'Golem',level:585,iv:140,quality:'1.526',shiny:false,power:9896,stats:{hp:1136,attack:1444,defense:1542,specialAttack:796,specialDefense:632,speed:935},source:'assisted',importedAt:'${now}'}],
      items:[], listings:[{id:'l1',pokemonId:'game-a1-pk1',accountId:'a1',pokemon:{id:'game-a1-pk1',accountId:'a1',speciesId:76,species:'Golem',level:585,iv:140,quality:'1.526',shiny:false,power:9896,stats:{hp:1136,attack:1444,defense:1542,specialAttack:796,specialDefense:632,speed:935},source:'assisted',importedAt:'${now}'},price:25,negotiable:true,status:'active',createdAt:'${now}',updatedAt:'${now}'}]
    }));
  `)
  await win.webContents.reload(); await new Promise(r => setTimeout(r, 300))
  await win.webContents.executeJavaScript(`document.querySelector('[title="Vitrine"]').click()`); await new Promise(r => setTimeout(r, 200))
  const initial = await win.webContents.executeJavaScript(`({
    active: document.querySelector('.showcase-tabs .active')?.textContent,
    filters: document.querySelectorAll('.showcase-filters input,.showcase-filters select').length,
    actions: [...document.querySelectorAll('.showcase-actions button')].map(b=>b.textContent),
    power: document.querySelector('.showcase-stats')?.textContent,
    contactButton: document.querySelector('.contact-settings-button')?.textContent,
    viewport: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
    filterRight: Math.round(document.querySelector('.showcase-filters')?.getBoundingClientRect().right || 0),
    mainRight: Math.round(document.querySelector('main')?.getBoundingClientRect().right || 0)
  })`)
  await win.webContents.capturePage().then(image => fs.writeFileSync(path.join(__dirname,'showcase-page-v12.png'),image.toPNG()))

  copiedPayload = null
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('.showcase-actions button')].find(b=>b.textContent.includes('Link WhatsApp')).click()`)
  for(let i=0;i<20&&!copiedPayload;i++) await new Promise(r=>setTimeout(r,100))
  const linkShare = { copied: !!copiedPayload, hasLink: copiedPayload?.text?.includes('https://pokecentral-rmt.vercel.app/s/'), hasPlayer: copiedPayload?.text?.includes('Jogador: MotoMoto'), hasAccountNumber: /Conta\s*[1-4]/.test(copiedPayload?.text||'') }

  copiedPayload = null
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('.showcase-actions button')].find(b=>b.textContent.includes('Copiar imagem')).click()`)
  for(let i=0;i<40&&!copiedPayload;i++) await new Promise(r=>setTimeout(r,150))
  const imageShare = { hasImage: copiedPayload?.imageDataUrl?.startsWith('data:image/png;base64,'), hasPower: copiedPayload?.text?.includes('Power: 9.896') }

  win.webContents.send('launcher:inventory-updated',{slot:1,characterName:'MotoMoto',pokemon:[],items:[],pokemonUpdated:true,itemsUpdated:false,capturedAt:new Date().toISOString(),source:'game-session'})
  await new Promise(r=>setTimeout(r,250))
  const removed = await win.webContents.executeJavaScript(`({activeCount:document.querySelector('.showcase-tabs button')?.textContent, removedCount:document.querySelectorAll('.showcase-tabs button')[1]?.textContent, saved:JSON.parse(localStorage.getItem('pokecentral.desktop.v1')).listings[0].status})`)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.showcase-tabs button')[1].click()`); await new Promise(r=>setTimeout(r,100))
  const archive = await win.webContents.executeJavaScript(`({cards:document.querySelectorAll('.showcase-card.removed').length,badge:document.querySelector('.showcase-card-art em')?.textContent,restoreDisabled:document.querySelector('.removed-actions .share-main')?.disabled})`)

  win.webContents.send('launcher:inventory-updated',{slot:1,characterName:'MotoMoto',pokemon:[{id:'pk1',speciesId:76,species:'Golem',level:585,quality:1.526,ivTotal:140,shiny:false,power:9896,stats:{hp:1136,attack:1444,defense:1542,specialAttack:796,specialDefense:632,speed:935}}],items:[],pokemonUpdated:true,itemsUpdated:false,capturedAt:new Date().toISOString(),source:'game-session'})
  await new Promise(r=>setTimeout(r,250))
  const restored = await win.webContents.executeJavaScript(`JSON.parse(localStorage.getItem('pokecentral.desktop.v1')).listings[0].status`)

  fs.writeFileSync(path.join(__dirname,'showcase-v12-result.json'),JSON.stringify({initial,linkShare,imageShare,removed,archive,restored},null,2))
  win.destroy(); app.exit(0)
}).catch(error=>{console.error(error);app.exit(1)})