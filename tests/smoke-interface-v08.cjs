const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
app.whenReady().then(async () => {
  for (const channel of ['launcher:hide-layout','launcher:update-layout','launcher:control']) ipcMain.handle(channel,()=>null)
  ipcMain.handle('launcher:show-layout',()=>[]); ipcMain.handle('launcher:inventory',()=>null)
  const win=new BrowserWindow({width:1366,height:850,show:false,webPreferences:{preload:path.join(__dirname,'..','out','preload','index.js'),nodeIntegration:false,contextIsolation:true,sandbox:true}})
  await win.loadFile(path.join(__dirname,'..','out','renderer','index.html'))
  const stats=(base)=>({hp:base,attack:base+10,defense:base+20,specialAttack:base+30,specialDefense:base+40,speed:base+50})
  await win.webContents.executeJavaScript(`localStorage.setItem('pokecentral.desktop.v1',JSON.stringify({
    accounts:[{id:'a1',name:'Conta 1',slot:1,status:'ready',characterName:'MotoMoto'}],
    pokemon:[
      {id:'p120',accountId:'a1',speciesId:6,species:'Charizard',level:100,iv:120,quality:'1.79',shiny:false,stats:${JSON.stringify(stats(100))},source:'assisted',importedAt:new Date().toISOString()},
      {id:'p140',accountId:'a1',speciesId:6,species:'Charizard',level:100,iv:140,quality:'1.79',shiny:false,stats:${JSON.stringify(stats(120))},source:'assisted',importedAt:new Date().toISOString()},
      {id:'p150',accountId:'a1',speciesId:6,species:'Charizard',level:100,iv:150,quality:'1.79',shiny:false,stats:${JSON.stringify(stats(140))},source:'assisted',importedAt:new Date().toISOString()}
    ],items:[{id:'i1',accountId:'a1',name:'Poké Ball',quantity:20,category:'ball',importedAt:new Date().toISOString()}]
  }))`)
  await win.webContents.reload(); await win.webContents.executeJavaScript('document.fonts.ready.then(()=>true)'); await new Promise(r=>setTimeout(r,250))
  await win.webContents.executeJavaScript(`document.querySelector('.nav-item').click()`); await new Promise(r=>setTimeout(r,180))
  const result=await win.webContents.executeJavaScript(`({
    potential:[...document.querySelectorAll('.potential-badge')].map(item=>({label:[...item.childNodes].find(node=>node.nodeType===Node.TEXT_NODE)?.textContent,score:item.querySelector('small')?.textContent})),
    powers:[...document.querySelectorAll('.power-value')].map(item=>item.textContent),
    hasPowerHeader:[...document.querySelectorAll('th')].some(th=>th.textContent==='Power atual'),
    duplicateStats:document.querySelectorAll('.inventory-stats').length,
    imageBoxes:[...document.querySelectorAll('.inventory-image.pokemon-sprite,.inventory-image.item-sprite')].map(item=>({width:getComputedStyle(item).width,height:getComputedStyle(item).height})),
    sidebarWidth:document.querySelector('.sidebar').getBoundingClientRect().width,
    menuIconSizes:[...document.querySelectorAll('.nav-item img')].map(img=>({width:getComputedStyle(img).width,height:getComputedStyle(img).height})),
    hintsInside:[...document.querySelectorAll('.account-open-hint')].every(hint=>hint.getBoundingClientRect().right<=document.querySelector('.sidebar').getBoundingClientRect().right)
  })`)
  fs.writeFileSync(path.join(__dirname,'smoke-v08-result.json'),JSON.stringify(result,null,2))
  const scores=result.potential.map(item=>Number(item.score?.split('/')[0]))
  const valid=result.potential[0].label==='Ótimo' && result.potential[1].label==='Ótimo' && result.potential[2].label==='Excepcional' && scores[0]<scores[1] && scores[1]<scores[2] && new Set(result.powers).size===3 && result.hasPowerHeader && result.duplicateStats===0 && result.imageBoxes.length===4 && result.imageBoxes.every(box=>box.width==='52px'&&box.height==='52px') && result.sidebarWidth>=309 && result.menuIconSizes.every(size=>size.width==='36px'&&size.height==='36px') && result.hintsInside
  win.destroy(); app.exit(valid?0:1)
}).catch(error=>{console.error(error);app.exit(1)})