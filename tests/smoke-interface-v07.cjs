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
    accounts:[1,2,3,4].map(slot=>({id:'a'+slot,name:'Conta '+slot,slot,status:'ready',characterName:'Personagem '+slot})),
    pokemon:[
      {id:'p1',accountId:'a1',speciesId:76,species:'Golem',level:585,iv:140,quality:'1.526',shiny:false,source:'assisted',importedAt:new Date().toISOString()},
      {id:'p2',accountId:'a2',speciesId:133,species:'Eevee',level:1,iv:105,quality:'1.791',shiny:true,source:'assisted',importedAt:new Date().toISOString()}
    ],items:[{id:'i1',accountId:'a1',name:'Poké Ball',quantity:50,category:'ball',importedAt:new Date().toISOString()}]
  }))`)
  await win.webContents.reload()
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
  await new Promise(resolve => setTimeout(resolve, 300))

  const sidebar = await win.webContents.executeJavaScript(`({
    navItems:document.querySelectorAll('.nav-item').length,
    navLabels:[...document.querySelectorAll('.nav-item')].map(item=>item.textContent.trim()),
    navIcons:[...document.querySelectorAll('.nav-item img')].map(img=>img.getAttribute('src')),
    allAccounts:document.querySelectorAll('.all-accounts-card').length,
    accountCards:document.querySelectorAll('.account-list .account-card').length,
    expandHints:document.querySelectorAll('.account-open-hint:not(.grid-hint)').length,
    gridSelected:document.querySelector('.all-accounts-card').classList.contains('selected'),
    hosts:document.querySelectorAll('.game-host').length,
    frameExpand:document.querySelectorAll('.game-frame-label button').length
  })`)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.account-list .account-card')[1].click()`)
  await new Promise(resolve => setTimeout(resolve, 150))
  const single = await win.webContents.executeJavaScript(`({hosts:document.querySelectorAll('.game-host').length,selected:document.querySelectorAll('.account-list .account-card.selected')[0]?.textContent.includes('Conta 1')})`)
  await win.webContents.executeJavaScript(`document.querySelector('.all-accounts-card').click()`)
  await new Promise(resolve => setTimeout(resolve, 150))
  const grid = await win.webContents.executeJavaScript(`({hosts:document.querySelectorAll('.game-host').length,selected:document.querySelector('.all-accounts-card').classList.contains('selected')})`)

  await win.webContents.executeJavaScript(`document.querySelectorAll('.nav-item')[0].click()`)
  await new Promise(resolve => setTimeout(resolve, 150))
  const inventory = await win.webContents.executeJavaScript(`({
    accountButtons:document.querySelectorAll('.inventory-account-filter button').length,
    filterBeforeTabs:document.querySelector('.inventory-account-filter').compareDocumentPosition(document.querySelector('.inventory-tabs'))===Node.DOCUMENT_POSITION_FOLLOWING,
    accountSelect:[...document.querySelectorAll('.inventory-filters label')].some(label=>label.textContent.startsWith('Conta')),
    tabs:document.querySelectorAll('.inventory-tabs button').length
  })`)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.inventory-account-filter button')[2].click()`)
  await new Promise(resolve => setTimeout(resolve, 100))
  const accountFilter = await win.webContents.executeJavaScript(`({active:document.querySelector('.inventory-account-filter button.active strong')?.textContent,rows:document.querySelector('.inventory-section')?.querySelectorAll('tbody tr').length ?? 0})`)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.rarity-filter button')[4].click()`)
  await new Promise(resolve => setTimeout(resolve, 80))
  const contrast = await win.webContents.executeJavaScript(`{
    const active=document.querySelector('.rarity-filter button.active'); const inactive=document.querySelector('.rarity-filter button:not(.active)');
    ({activeOpacity:getComputedStyle(active).opacity,inactiveOpacity:getComputedStyle(inactive).opacity,activeBackground:getComputedStyle(active).backgroundColor,inactiveBackground:getComputedStyle(inactive).backgroundColor,hasCheck:getComputedStyle(active,'::before').content})
  }`)
  const result={sidebar,single,grid,inventory,accountFilter,contrast}
  fs.writeFileSync(path.join(__dirname,'smoke-v07-result.json'),JSON.stringify(result,null,2))
  const valid=sidebar.navItems===2 && sidebar.navLabels.includes('Inventário') && sidebar.navLabels.includes('Laboratório') && sidebar.navIcons.some(src=>src.includes('mochila.png')) && sidebar.navIcons.some(src=>src.includes('lab.png')) && sidebar.allAccounts===1 && sidebar.accountCards===5 && sidebar.expandHints===4 && sidebar.gridSelected && sidebar.hosts===4 && sidebar.frameExpand===0 && single.hosts===1 && single.selected && grid.hosts===4 && grid.selected && inventory.accountButtons===5 && inventory.filterBeforeTabs && !inventory.accountSelect && inventory.tabs===4 && accountFilter.active==='Conta 2' && accountFilter.rows===1 && contrast.activeOpacity==='1' && Number(contrast.inactiveOpacity)<0.7 && contrast.activeBackground!==contrast.inactiveBackground && contrast.hasCheck.includes('✓')
  win.destroy(); app.exit(valid?0:1)
}).catch(error=>{console.error(error);app.exit(1)})