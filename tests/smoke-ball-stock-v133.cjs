const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
let controls = []
app.whenReady().then(async () => {
  for (const channel of ['launcher:hide-layout', 'launcher:update-layout']) ipcMain.handle(channel, () => null)
  ipcMain.handle('launcher:control', (_event, slot, action) => { controls.push({ slot, action }); return null })
  ipcMain.handle('launcher:show-layout', (_event, placements) => placements.map(({ slot }) => ({ slot, state: 'ready', characterName: `Jogador ${slot}` })))
  ipcMain.handle('launcher:inventory', () => null)
  const win = new BrowserWindow({ width: 1366, height: 850, show: false, webPreferences: { preload: path.join(__dirname, '..', 'out', 'preload', 'index.js'), contextIsolation: true, sandbox: true } })
  await win.loadFile(path.join(__dirname, '..', 'out', 'renderer', 'index.html'))
  const now = new Date().toISOString()
  const accounts = [1,2,3,4].map(slot => ({ id:`a${slot}`, name:`Conta ${slot}`, characterName:['SugarOMyavara','Melbilaw','MotoMoto','MikaoPz'][slot-1], slot, status:'ready', lastSync:now }))
  const item = (id, accountId, name, quantity, icon) => ({ id, accountId, name, quantity, category:'ball', icon, importedAt:now })
  const state = { accounts, pokemon:[], listings:[], items:[
    item('u1','a1','Ultra Ball',466,'/assets/markitems/ultra_ball.png'), item('d1','a1','Idle Ball',82,'/assets/markitems/idle_ball.png'),
    item('u2','a2','Ultra Ball',0,'/assets/markitems/ultra_ball.png'), item('d2','a2','Idle Ball',12550,'/assets/markitems/idle_ball.png'),
    item('u3','a3','Ultra Ball',77,'/assets/markitems/ultra_ball.png'), item('d3','a3','Idle Ball',34,'/assets/markitems/idle_ball.png')
  ] }
  await win.webContents.executeJavaScript(`localStorage.setItem('pokecentral.desktop.v1', ${JSON.stringify(JSON.stringify(state))}); localStorage.removeItem('pokecentral.sidebar.collapsed')`)
  await win.webContents.reload(); await new Promise(r=>setTimeout(r,350))
  const grid = await win.webContents.executeJavaScript(`({
    quickRemoved: !document.querySelector('.quick-inventory'),
    cards: document.querySelectorAll('.account-list .account-card').length,
    chips: [...document.querySelectorAll('.game-frame-label .ball-stock-chip')].map(x=>({text:x.textContent.trim(),state:x.className,title:x.title})),
    headersFit: [...document.querySelectorAll('.game-frame-label')].every(x=>x.scrollWidth <= x.clientWidth),
    appOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth
  })`)
  await win.webContents.capturePage().then(img=>fs.writeFileSync(path.join(__dirname,'ball-stock-grid-v133.png'),img.toPNG()))
  win.setSize(1024,768); await new Promise(r=>setTimeout(r,180))
  const narrow = await win.webContents.executeJavaScript(`({headersFit:[...document.querySelectorAll('.game-frame-label')].every(x=>x.scrollWidth<=x.clientWidth),appOverflow:document.documentElement.scrollWidth<=document.documentElement.clientWidth,chips:document.querySelectorAll('.game-frame-label .ball-stock-chip').length})`)
  await win.webContents.executeJavaScript(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'3',ctrlKey:true,bubbles:true}))`); await new Promise(r=>setTimeout(r,150))
  const single = await win.webContents.executeJavaScript(`({single:!!document.querySelector('.launcher-page.mode-single.active'), selected:document.querySelector('.account-card.account-color-3')?.classList.contains('selected'), wideChips:document.querySelectorAll('.game-toolbar .ball-stock-chip').length})`)
  await win.webContents.executeJavaScript(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await new Promise(r=>setTimeout(r,100))
  await win.webContents.executeJavaScript(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'r',ctrlKey:true,bubbles:true}))`); await new Promise(r=>setTimeout(r,60))
  const shortcuts = { backInGrid: await win.webContents.executeJavaScript(`!!document.querySelector('.launcher-page.mode-grid.active')`), controls }
  const states = grid.chips.map(x=>x.state)
  const passed = grid.quickRemoved && grid.cards === 5 && grid.chips.length === 8 && grid.headersFit && grid.appOverflow && narrow.headersFit && narrow.appOverflow && narrow.chips === 8 && states.some(x=>x.includes('ok')) && states.some(x=>x.includes('low')) && states.some(x=>x.includes('empty')) && states.some(x=>x.includes('unknown')) && single.single && single.selected && single.wideChips === 2 && shortcuts.backInGrid && controls.some(x=>x.action==='reload')
  const result={passed,grid,narrow,single,shortcuts}; fs.writeFileSync(path.join(__dirname,'ball-stock-v133-result.json'),JSON.stringify(result,null,2)); console.log(JSON.stringify(result,null,2)); win.destroy(); app.exit(passed?0:1)
}).catch(e=>{console.error(e);app.exit(1)})