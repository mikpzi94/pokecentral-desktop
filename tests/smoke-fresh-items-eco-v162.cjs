const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

app.whenReady().then(async () => {
  const controls = []
  for (const channel of ['launcher:hide-layout', 'launcher:update-layout']) ipcMain.handle(channel, () => null)
  ipcMain.handle('launcher:show-layout', () => [])
  ipcMain.handle('launcher:control', (_event, slot, action) => { controls.push({ slot, action }) })
  ipcMain.handle('launcher:inventory', () => null)
  ipcMain.handle('share:copy-card', () => null)
  ipcMain.handle('share:open-url', () => null)
  const window = new BrowserWindow({ width: 1500, height: 900, show: false, webPreferences: { preload: path.join(__dirname, '..', 'out', 'preload', 'index.js'), contextIsolation: true, sandbox: true } })
  await window.loadFile(path.join(__dirname, '..', 'out', 'renderer', 'index.html'))
  const now = new Date().toISOString()
  const account = { id: 'a1', name: 'Conta 1', characterName: 'MotoMoto', slot: 1, status: 'ready' }
  const pokemon = { id: 'p1', accountId: 'a1', speciesId: 76, species: 'Golem', level: 100, iv: 140, quality: '1.526', shiny: false, source: 'assisted', importedAt: now }
  const items = [
    { id: 'boss', accountId: 'a1', itemId: 9001, name: 'Bronze Boss Token', quantity: 3, category: 'item', importedAt: now },
    { id: 'tm', accountId: 'a1', itemId: 9002, name: 'TM Disc Piece', quantity: 12, category: 'item', importedAt: now }
  ]
  await window.webContents.executeJavaScript(`localStorage.setItem('pokecentral.desktop.v1',${JSON.stringify(JSON.stringify({ accounts: [account], pokemon: [pokemon], items, listings: [], huntSessions: [] }))});localStorage.setItem('pokecentral.settings.v1',JSON.stringify({ecoMode:false}))`)
  await window.webContents.reload()
  await new Promise((resolve) => setTimeout(resolve, 150))
  await window.webContents.executeJavaScript(`document.querySelectorAll('.nav-item')[1].click()`)
  await new Promise((resolve) => setTimeout(resolve, 80))
  const itemNames = await window.webContents.executeJavaScript(`document.querySelector('.inventory-results').textContent`)
  await window.webContents.executeJavaScript(`document.querySelector('.accounts-manage-trigger').click()`)
  await new Promise((resolve) => setTimeout(resolve, 50))
  await window.webContents.executeJavaScript(`(()=>{const row=[...document.querySelectorAll('.settings-row')].find(row=>row.textContent.includes('Modo Econômico'));row.querySelector('input').click()})()`)
  await new Promise((resolve) => setTimeout(resolve, 150))
  const ecoChecked = await window.webContents.executeJavaScript(`[...document.querySelectorAll('.settings-row')].find(row=>row.textContent.includes('Modo Econômico')).querySelector('input').checked`)
  await window.webContents.executeJavaScript(`document.querySelector('.accounts-manager-actions .primary').click();document.querySelectorAll('.nav-item')[0].click()`)
  await new Promise((resolve) => setTimeout(resolve, 200))
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8')
  const genericCollector = source.includes('itemShaped') && source.includes('teamDetails') && source.includes('setFrameRate(enabled ? 20 : 60)')
  const valid = itemNames.includes('Bronze Boss Token') && itemNames.includes('TM Disc Piece') && ecoChecked && controls.some((entry) => entry.action === 'eco-on') && genericCollector
  console.log(JSON.stringify({ items: [itemNames.includes('Bronze Boss Token'), itemNames.includes('TM Disc Piece')], ecoChecked, controls, genericCollector, valid }))
  window.destroy()
  app.exit(valid ? 0 : 1)
}).catch((error) => { console.error(error); app.exit(1) })
