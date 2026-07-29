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
    ],items:[{id:'i1',accountId:'a1',itemId:1,name:'Poké Ball',quantity:50,category:'ball',importedAt:new Date().toISOString()},{id:'i2',accountId:'a1',itemId:200,name:'Small Potion',quantity:12,category:'item',icon:'/assets/markitems/small_potion.png',importedAt:new Date().toISOString()}]
  }))`)
  await win.webContents.reload()
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
  await new Promise(resolve => setTimeout(resolve, 600))

  const grid = await win.webContents.executeJavaScript(`({
    hosts:document.querySelectorAll('.game-host').length,
    expandButtons:document.querySelectorAll('.game-frame-label button').length,
    logo:document.querySelector('.brand-mark img')?.getAttribute('src'),
    coloredFrames:document.querySelectorAll('.game-frame[class*="account-color-"]').length
  })`)
  await win.webContents.executeJavaScript(`document.querySelector('.game-frame-label button').click()`)
  await new Promise(resolve => setTimeout(resolve, 180))
  const single = await win.webContents.executeJavaScript(`({hosts:document.querySelectorAll('.game-host').length,back:document.querySelectorAll('.back-to-grid').length})`)

  await win.webContents.executeJavaScript(`document.querySelectorAll('.nav-item')[1].click()`)
  await new Promise(resolve => setTimeout(resolve, 250))
  const inventoryInitial = await win.webContents.executeJavaScript(`({
    rarityButtons:document.querySelectorAll('.rarity-filter button').length,
    qualityMinimum:[...document.querySelectorAll('label')].some(label=>label.textContent.includes('Quality mínima')),
    shinyButtons:document.querySelectorAll('.shiny-toggle').length,
    images:document.querySelectorAll('.inventory-identity .inventory-image').length,
    badges:[...document.querySelectorAll('.quality-badge,.potential-badge')].map(item=>getComputedStyle(item).fontSize)
  })`)
  await win.webContents.executeJavaScript(`{
    const buttons=[...document.querySelectorAll('.rarity-filter button')];
    buttons.find(button=>button.textContent==='Épico').click();
    buttons.find(button=>button.textContent==='Lendário').click();
  }`)
  await new Promise(resolve => setTimeout(resolve, 120))
  const multiRarity = await win.webContents.executeJavaScript(`({active:document.querySelectorAll('.rarity-filter button.active').length,rows:document.querySelector('.inventory-section')?.querySelectorAll('tbody tr').length ?? 0})`)
  await win.webContents.executeJavaScript(`document.querySelector('.shiny-toggle').click()`)
  await new Promise(resolve => setTimeout(resolve, 120))
  const shiny = await win.webContents.executeJavaScript(`({pressed:document.querySelector('.shiny-toggle').getAttribute('aria-pressed'),pokemonRows:document.querySelector('.inventory-section')?.querySelectorAll('tbody tr').length ?? 0})`)

  await win.webContents.executeJavaScript(`document.querySelectorAll('.nav-item')[2].click()`)
  await new Promise(resolve => setTimeout(resolve, 250))
  const lab = await win.webContents.executeJavaScript(`({
    optionText:[...document.querySelectorAll('.lab-selectors select')[1].options].map(option=>option.textContent),
    image:document.querySelectorAll('.lab-pokemon-sprite').length,
    rarityLabel:document.querySelector('.lab-rarity-label')?.textContent
  })`)
  const screenshot = await win.capturePage()
  fs.writeFileSync(path.join(__dirname, 'smoke-v06.png'), screenshot.toPNG())
  const result={grid,single,inventoryInitial,multiRarity,shiny,lab}
  fs.writeFileSync(path.join(__dirname,'smoke-v06-result.json'),JSON.stringify(result,null,2))
  const valid=grid.hosts===4 && grid.expandButtons===4 && grid.logo?.includes('logo.png') && grid.coloredFrames===4 && single.hosts===1 && single.back===1 && inventoryInitial.rarityButtons===9 && !inventoryInitial.qualityMinimum && inventoryInitial.shinyButtons===1 && inventoryInitial.images>=2 && inventoryInitial.badges.every(size=>parseFloat(size)>=10) && multiRarity.active===2 && multiRarity.rows===2 && shiny.pressed==='true' && shiny.pokemonRows===1 && lab.optionText.some(text=>text.includes('Épico')) && lab.image===1 && lab.rarityLabel==='Épico'
  win.destroy()
  app.exit(valid?0:1)
}).catch(error=>{console.error(error);app.exit(1)})