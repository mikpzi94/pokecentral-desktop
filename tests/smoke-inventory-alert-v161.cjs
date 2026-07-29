const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')

app.whenReady().then(async () => {
  for (const channel of ['launcher:hide-layout', 'launcher:update-layout', 'launcher:control']) ipcMain.handle(channel, () => null)
  ipcMain.handle('launcher:show-layout', () => [])
  ipcMain.handle('launcher:inventory', () => null)
  ipcMain.handle('share:copy-card', () => null)
  ipcMain.handle('share:open-url', () => null)
  const window = new BrowserWindow({ width: 1500, height: 900, show: false, webPreferences: { preload: path.join(__dirname, '..', 'out', 'preload', 'index.js'), contextIsolation: true, sandbox: true } })
  await window.loadFile(path.join(__dirname, '..', 'out', 'renderer', 'index.html'))
  const now = new Date().toISOString()
  const stale = new Date(Date.now() - 11 * 60_000).toISOString()
  const account = { id: 'a1', name: 'Conta 1', characterName: 'MotoMoto', slot: 1, status: 'ready' }
  const pokemon = Array.from({ length: 60 }, (_, index) => ({ id: `p${index}`, accountId: 'a1', speciesId: index ? 76 : 6, species: index ? `Golem ${index}` : 'Charizard', level: index ? 585 : 93, iv: 140, quality: '1.526', shiny: false, source: 'assisted', importedAt: now }))
  const stalled = { id: 'stalled', slot: 1, huntName: 'Magneton', pokemonName: 'Charizard', startedAt: stale, updatedAt: now, lastActivityAt: stale, kills: 0, xp: 0, gold: 0, captures: 0, shinies: 0, dataQuality: 'complete', source: 'game-session' }
  const state = { accounts: [account], pokemon, items: [], listings: [], huntSessions: [stalled], huntSettings: { notifyShiny: true, soundEnabled: false, stallMinutes: 10 } }
  await window.webContents.executeJavaScript(`localStorage.setItem('pokecentral.desktop.v1',${JSON.stringify(JSON.stringify(state))})`)
  await window.webContents.reload()
  await new Promise((resolve) => setTimeout(resolve, 150))
  const alert = await window.webContents.executeJavaScript(`document.body.textContent.includes('VERIFICAR')`)
  await window.webContents.executeJavaScript(`document.querySelectorAll('.nav-item')[1].click()`)
  await new Promise((resolve) => setTimeout(resolve, 100))
  const inventory = await window.webContents.executeJavaScript(`(()=>{const page=document.querySelector('.inventory-dashboard');const area=document.querySelector('.inventory-results .table-wrap');const button=document.querySelector('.analyze-button');return{pageOverflow:(page?.scrollHeight||0)-(page?.clientHeight||0),height:area?.clientHeight||0,overflow:(area?.scrollHeight||0)-(area?.clientHeight||0),button:Boolean(button)}})()`)
  await window.webContents.executeJavaScript(`document.querySelector('.analyze-button').click()`)
  await new Promise((resolve) => setTimeout(resolve, 100))
  const lab = await window.webContents.executeJavaScript(`(()=>{const selects=document.querySelectorAll('.lab-selectors select');return{visible:Boolean(document.querySelector('.lab-page')),pokemon:[...selects].some(select=>select.value==='p0')}})()`)
  const valid = alert && inventory.button && inventory.pageOverflow > 50 && inventory.height >= 300 && inventory.overflow > 100 && lab.visible && lab.pokemon
  console.log(JSON.stringify({ alert, inventory, lab, valid }))
  window.destroy()
  app.exit(valid ? 0 : 1)
}).catch((error) => { console.error(error); app.exit(1) })
