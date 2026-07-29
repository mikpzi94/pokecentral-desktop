const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

app.whenReady().then(async () => {
  for (const channel of ['launcher:hide-layout', 'launcher:update-layout', 'launcher:control']) ipcMain.handle(channel, () => null)
  ipcMain.handle('launcher:show-layout', () => [])
  ipcMain.handle('launcher:inventory', () => null)

  const win = new BrowserWindow({
    width: 1366,
    height: 850,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'out', 'preload', 'index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })
  await win.loadFile(path.join(__dirname, '..', 'out', 'renderer', 'index.html'))
  await win.webContents.executeJavaScript(`localStorage.setItem('pokecentral.desktop.v1', JSON.stringify({
    accounts:[1,2,3,4].map(slot=>({id:'a'+slot,name:'Conta '+slot,slot,status:'ready',characterName:'Personagem '+slot,lastSync:new Date().toISOString()})),
    pokemon:[
      {id:'p1',accountId:'a1',species:'Golem',level:585,iv:140,quality:'1.526',shiny:false,source:'assisted',importedAt:new Date().toISOString()},
      {id:'p2',accountId:'a2',species:'Eevee',level:1,iv:105,quality:'1.791',shiny:true,source:'assisted',importedAt:new Date().toISOString()},
      {id:'p3',accountId:'a2',species:'Typhlosion',level:1,iv:77,quality:'1.453',shiny:false,source:'assisted',importedAt:new Date().toISOString()},
      {id:'p4',accountId:'a3',species:'Charmander',level:50,iv:95,quality:'1.200',shiny:false,source:'assisted',importedAt:new Date().toISOString()}
    ]
  }))`)
  await win.webContents.reload()
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
  await new Promise((resolve) => setTimeout(resolve, 400))

  const grid = await win.webContents.executeJavaScript(`({
    hosts: document.querySelectorAll('.game-host').length,
    expandButtons: [...document.querySelectorAll('button')].filter(button => button.textContent.includes('AMPLIAR')).length,
    accountTabs: document.querySelectorAll('.launcher-account-tabs').length,
    navItems: document.querySelectorAll('.nav-item').length,
    sidebar: getComputedStyle(document.querySelector('.sidebar')).display,
    bodyOverflow: getComputedStyle(document.body).overflow
  })`)

  await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button => button.textContent.includes('AMPLIAR') && button.getAttribute('aria-label').includes('2')).click()`)
  await new Promise((resolve) => setTimeout(resolve, 250))
  const single = await win.webContents.executeJavaScript(`({hosts:document.querySelectorAll('.game-host').length,back:[...document.querySelectorAll('button')].filter(button=>button.textContent.includes('VOLTAR À GRADE')).length})`)
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button => button.textContent.includes('VOLTAR À GRADE')).click()`)
  await new Promise((resolve) => setTimeout(resolve, 250))

  await win.webContents.executeJavaScript(`[...document.querySelectorAll('.nav-item')].find(button => button.textContent.includes('Inventário')).click()`)
  await new Promise((resolve) => setTimeout(resolve, 250))
  const inventory = await win.webContents.executeJavaScript(`(() => {
    const selects = document.querySelectorAll('.inventory-filters select')
    const account = selects[0]
    account.value = 'a2'; account.dispatchEvent(new Event('change', {bubbles:true}))
    const shiny = selects[1]
    shiny.value = 'shiny'; shiny.dispatchEvent(new Event('change', {bubbles:true}))
    return {filterInputs:document.querySelectorAll('.inventory-filters input').length,filterSelects:selects.length,hasImport:document.body.innerText.toUpperCase().includes('IMPORTA')}
  })()`)
  await new Promise((resolve) => setTimeout(resolve, 250))
  inventory.rowsAfterFilter = await win.webContents.executeJavaScript(`document.querySelectorAll('tbody tr').length`)

  const result = { grid, single, inventory }
  fs.writeFileSync(path.join(__dirname, 'smoke-v04-result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
  const valid = grid.hosts === 4 && grid.expandButtons === 4 && grid.accountTabs === 0 && grid.navItems === 2 && grid.sidebar !== 'none' && grid.bodyOverflow === 'hidden' && single.hosts === 1 && single.back === 1 && inventory.filterInputs === 3 && inventory.filterSelects === 3 && inventory.hasImport === false && inventory.rowsAfterFilter === 1
  win.destroy()
  app.exit(valid ? 0 : 1)
}).catch((error) => {
  console.error(error)
  app.exit(1)
})