const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

app.whenReady().then(async () => {
  for (const channel of ['launcher:hide-layout', 'launcher:update-layout', 'launcher:control']) ipcMain.handle(channel, () => null)
  ipcMain.handle('launcher:show-layout', (_event, placements) => placements.map(({ slot }) => ({ slot, state: 'ready', characterName: `Jogador ${slot}` })))
  ipcMain.handle('launcher:inventory', () => null)
  const win = new BrowserWindow({ width: 1600, height: 1000, show: false, webPreferences: { preload: path.join(__dirname, '..', 'out', 'preload', 'index.js'), contextIsolation: true, sandbox: true } })
  await win.loadFile(path.join(__dirname, '..', 'out', 'renderer', 'index.html'))
  const now = new Date().toISOString()
  const state = {
    accounts: [
      { id: 'a1', name: 'Conta 1', characterName: 'MotoMoto', slot: 1, status: 'ready' },
      { id: 'a2', name: 'Conta 2', characterName: 'Melbilaw', slot: 2, status: 'ready' }
    ],
    pokemon: [
      { id: 'p1', accountId: 'a1', speciesId: 6, species: 'Charizard', level: 507, quality: '1.713', iv: 132, shiny: false, source: 'assisted', importedAt: now },
      { id: 'p2', accountId: 'a1', speciesId: 133, species: 'Eevee', level: 31, quality: '1.210', iv: 101, shiny: true, source: 'assisted', importedAt: now },
      { id: 'p3', accountId: 'a2', speciesId: 76, species: 'Golem', level: 585, quality: '1.526', iv: 140, shiny: false, source: 'assisted', importedAt: now }
    ],
    items: [
      { id: 'i1', accountId: 'a1', name: 'Ultra Ball', quantity: 8999, category: 'ball', importedAt: now },
      { id: 'i2', accountId: 'a1', name: 'Potion', quantity: 138, category: 'item', importedAt: now },
      { id: 'i3', accountId: 'a1', name: 'Rare Candy', quantity: 35, category: 'item', importedAt: now }
    ], listings: []
  }
  await win.webContents.executeJavaScript(`localStorage.setItem('pokecentral.desktop.v1', ${JSON.stringify(JSON.stringify(state))}); localStorage.removeItem('pokecentral.sidebar.collapsed')`)
  await win.webContents.reload()
  await new Promise(resolve => setTimeout(resolve, 350))
  await win.webContents.executeJavaScript(`document.querySelector('.account-card-profile').click()`)
  await new Promise(resolve => setTimeout(resolve, 180))
  const quick = await win.webContents.executeJavaScript(`({
    panel: !!document.querySelector('.quick-inventory'),
    title: document.querySelector('.quick-inventory-header')?.textContent,
    tabs: [...document.querySelectorAll('.quick-inventory-tabs button')].map(x => x.textContent),
    cells: document.querySelectorAll('.quick-inventory-cell').length,
    gridStillActive: document.querySelector('.all-accounts-card').classList.contains('selected'),
    quickSelected: document.querySelector('.account-card-row').classList.contains('quick-selected'),
    overflow: getComputedStyle(document.querySelector('.quick-inventory-grid')).overflow
  })`)
  await win.webContents.capturePage().then(image => fs.writeFileSync(path.join(__dirname, 'quick-inventory-v132.png'), image.toPNG()))
  await win.webContents.executeJavaScript(`document.querySelectorAll('.quick-inventory-tabs button')[2].click()`)
  await new Promise(resolve => setTimeout(resolve, 80))
  const balls = await win.webContents.executeJavaScript(`({ cells: document.querySelectorAll('.quick-inventory-cell').length, label: document.querySelector('.quick-inventory-cell')?.getAttribute('aria-label') })`)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.account-expand-action')[1].click()`)
  await new Promise(resolve => setTimeout(resolve, 180))
  const expanded = await win.webContents.executeJavaScript(`({ selected: document.querySelectorAll('.account-card-row')[1].classList.contains('expanded'), gridActive: document.querySelector('.all-accounts-card').classList.contains('selected') })`)
  const passed = quick.panel && quick.cells === 5 && quick.tabs.length === 4 && quick.gridStillActive && quick.quickSelected && quick.overflow === 'hidden' && balls.cells === 1 && /Ultra Ball/.test(balls.label) && expanded.selected && !expanded.gridActive
  const result = { passed, quick, balls, expanded }
  fs.writeFileSync(path.join(__dirname, 'quick-inventory-v132-result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  win.destroy(); app.exit(passed ? 0 : 1)
}).catch(error => { console.error(error); app.exit(1) })