const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

app.whenReady().then(async () => {
  for (const channel of ['launcher:hide-layout', 'launcher:update-layout', 'launcher:control']) ipcMain.handle(channel, () => null)
  ipcMain.handle('launcher:show-layout', () => [])
  ipcMain.handle('launcher:inventory', () => null)

  const win = new BrowserWindow({ width: 1366, height: 850, show: false, webPreferences: { preload: path.join(__dirname, '..', 'out', 'preload', 'index.js'), nodeIntegration: false, contextIsolation: true, sandbox: true } })
  await win.loadFile(path.join(__dirname, '..', 'out', 'renderer', 'index.html'))
  await win.webContents.executeJavaScript(`localStorage.setItem('pokecentral.desktop.v1', JSON.stringify({
    accounts:[1,2,3,4].map(slot=>({id:'a'+slot,name:'Conta '+slot,slot,status:'ready',characterName:'Personagem '+slot,lastSync:new Date().toISOString()})),
    pokemon:[
      {id:'p1',accountId:'a1',speciesId:76,species:'Golem',level:585,iv:140,quality:'1.526',shiny:false,stats:{hp:748,attack:794,defense:794,specialAttack:521,specialDefense:531,speed:547},source:'assisted',importedAt:new Date().toISOString()},
      {id:'p2',accountId:'a2',speciesId:133,species:'Eevee',level:1,iv:105,quality:'1.791',shiny:true,source:'assisted',importedAt:new Date().toISOString()}
    ],items:[]
  }))`)
  await win.webContents.reload()
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
  await new Promise(resolve => setTimeout(resolve, 350))

  const grid = await win.webContents.executeJavaScript(`({
    hosts:document.querySelectorAll('.game-host').length,
    expandButtons:[...document.querySelectorAll('button')].filter(button=>button.textContent.includes('AMPLIAR')).length,
    navItems:document.querySelectorAll('.nav-item').length,
    coloredAccounts:document.querySelectorAll('.account-card[class*="account-color-"]').length,
    coloredFrames:document.querySelectorAll('.game-frame[class*="account-color-"]').length
  })`)

  await win.webContents.executeJavaScript(`[...document.querySelectorAll('.account-card')][1].click()`)
  await new Promise(resolve => setTimeout(resolve, 220))
  const sidebarOpen = await win.webContents.executeJavaScript(`({hosts:document.querySelectorAll('.game-host').length,back:[...document.querySelectorAll('button')].filter(button=>button.textContent.includes('VOLTAR À GRADE')).length})`)
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button=>button.textContent.includes('VOLTAR À GRADE')).click()`)
  await new Promise(resolve => setTimeout(resolve, 180))

  win.webContents.send('launcher:inventory-updated', {slot:1,characterName:'Personagem 1',pokemon:[],items:[{id:'1',itemId:1,name:'Poké Ball',quantity:50,category:'ball',npcPrice:5},{id:'200',itemId:200,name:'Potion',quantity:12,category:'item',gameCategory:'heal',npcPrice:5}],pokemonUpdated:false,itemsUpdated:true,capturedAt:new Date().toISOString(),source:'game-session'})
  await new Promise(resolve => setTimeout(resolve, 220))
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('.nav-item')].find(button=>button.textContent.includes('Inventário')).click()`)
  await new Promise(resolve => setTimeout(resolve, 220))
  const inventory = await win.webContents.executeJavaScript(`({
    tabs:document.querySelectorAll('.inventory-tabs button').length,
    hasIvPercent:document.body.innerText.includes('140%'),
    hasIvInteger:document.body.innerText.includes('140'),
    rarity:document.body.innerText.includes('Épico'),
    potential:document.querySelectorAll('.potential-badge').length,
    accountColors:document.querySelectorAll('.account-cell[class*="account-bg-"]').length
  })`)
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('.inventory-tabs button')].find(button=>button.textContent.includes('Pokébolas')).click()`)
  await new Promise(resolve => setTimeout(resolve, 150))
  inventory.ballRows = await win.webContents.executeJavaScript(`document.querySelectorAll('tbody tr').length`)
  inventory.ballQuantity = await win.webContents.executeJavaScript(`document.body.innerText.includes('50')`)

  await win.webContents.executeJavaScript(`[...document.querySelectorAll('.nav-item')].find(button=>button.textContent.includes('Laboratório')).click()`)
  await new Promise(resolve => setTimeout(resolve, 220))
  const lab = await win.webContents.executeJavaScript(`({
    selectors:document.querySelectorAll('.lab-selectors select').length,
    verdict:document.querySelector('.lab-verdict strong')?.textContent,
    power:document.querySelectorAll('.lab-summary article')[3]?.querySelector('strong')?.textContent,
    statRows:document.querySelectorAll('.stat-row').length,
    mentionsIndependent:document.body.innerText.includes('própria do PokeCentral')
  })`)

  const result = {grid,sidebarOpen,inventory,lab}
  fs.writeFileSync(path.join(__dirname,'smoke-v05-result.json'),JSON.stringify(result,null,2))
  const valid = grid.hosts===4 && grid.expandButtons===0 && grid.navItems===3 && grid.coloredAccounts===4 && grid.coloredFrames===4 && sidebarOpen.hosts===1 && sidebarOpen.back===1 && inventory.tabs===4 && !inventory.hasIvPercent && inventory.hasIvInteger && inventory.rarity && inventory.potential===2 && inventory.ballRows===1 && inventory.ballQuantity && lab.selectors===2 && lab.statRows===6 && lab.power!=='—' && lab.mentionsIndependent
  win.destroy()
  app.exit(valid?0:1)
}).catch(error=>{console.error(error);app.exit(1)})