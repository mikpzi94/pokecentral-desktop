const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
let controls=[]; let copied=[]
app.whenReady().then(async()=>{
  for(const channel of ['launcher:hide-layout','launcher:update-layout']) ipcMain.handle(channel,()=>null)
  ipcMain.handle('launcher:show-layout',(_e,p)=>p.map(({slot})=>({slot,state:'ready',characterName:`Player ${slot}`})))
  ipcMain.handle('launcher:control',(_e,p)=>{controls.push(p);return null})
  ipcMain.handle('launcher:inventory',()=>null)
  ipcMain.handle('share:copy-card',(_e,p)=>{copied.push(p);return null})
  ipcMain.handle('share:open-url',()=>null)
  const win=new BrowserWindow({width:1400,height:900,show:false,webPreferences:{preload:path.join(__dirname,'..','out','preload','index.js'),contextIsolation:true,sandbox:true}})
  await win.loadFile(path.join(__dirname,'..','out','renderer','index.html'))
  const iso=new Date().toISOString(); const poke={id:'p1',accountId:'a1',species:'Golem',level:585,quality:'1.526',iv:140,shiny:false,source:'assisted',importedAt:iso,stats:{hp:1136,attack:1444,defense:1542,specialAttack:796,specialDefense:632,speed:935}}
  const state={accounts:[{id:'a1',name:'Conta 1',characterName:'MotoMoto',slot:1,status:'ready',lastSync:iso}],pokemon:[poke],items:[],listings:[{id:'legacy',pokemonId:'p1',accountId:'a1',pokemon:poke,price:120,negotiable:true,status:'active',createdAt:iso,updatedAt:iso}]}
  await win.webContents.executeJavaScript(`localStorage.removeItem('pokecentral.showcase.code-sequences.v1');localStorage.setItem('pokecentral.desktop.v1',${JSON.stringify(JSON.stringify(state))})`); await win.webContents.reload(); await new Promise(r=>setTimeout(r,250))
  const nav=await win.webContents.executeJavaScript(`[...document.querySelectorAll('.nav-item span')].map(x=>x.textContent.trim())`)
  await win.webContents.executeJavaScript(`document.querySelector('.accounts-manage-trigger').click()`); await new Promise(r=>setTimeout(r,50)); const manager=await win.webContents.executeJavaScript(`!!document.querySelector('.accounts-manager') && document.querySelectorAll('.accounts-manager-list>div').length===1`); await win.webContents.executeJavaScript(`document.querySelector('.accounts-manager-actions .primary').click()`)
  win.webContents.send('launcher:status',{slot:1,state:'stalled',message:'teste'}); await new Promise(r=>setTimeout(r,80)); const stalled=await win.webContents.executeJavaScript(`!!document.querySelector('.stall-warning')`)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.nav-item')[4].click()`); await new Promise(r=>setTimeout(r,100)); const code=await win.webContents.executeJavaScript(`document.querySelector('.listing-local-code').textContent`)
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('.showcase-overview-actions button')].find(x=>x.textContent.includes('grupo')).click()`); await new Promise(r=>setTimeout(r,40)); await win.webContents.executeJavaScript(`document.querySelector('.showcase-select-toggle').click()`); await new Promise(r=>setTimeout(r,50)); await win.webContents.executeJavaScript(`document.querySelector('.catalog-selection-bar .primary').click()`); await new Promise(r=>setTimeout(r,350)); const catalog=await win.webContents.executeJavaScript(`({pages:document.querySelectorAll('.catalog-preview-modal img').length,title:document.querySelector('.catalog-preview-modal h2')?.textContent})`); if(catalog.pages) { await win.webContents.executeJavaScript(`[...document.querySelectorAll('.catalog-preview-actions button')].at(-1).click()`); await new Promise(r=>setTimeout(r,50)) }
  const saved=await win.webContents.executeJavaScript(`JSON.parse(localStorage.getItem('pokecentral.desktop.v1')).listings[0].publicCode`)
  const valid=JSON.stringify(nav)===JSON.stringify(['Telas','Inventário','Laboratório','Hunts','Vitrine'])&&manager&&stalled&&code==='AC1-001'&&saved==='AC1-001'&&catalog.pages===1&&copied.some(x=>String(x.imageDataUrl).startsWith('data:image/png'))
  console.log(JSON.stringify({nav,manager,stalled,code,saved,catalog,copied:copied.length,valid},null,2)); win.destroy(); app.exit(valid?0:1)
}).catch(error=>{console.error(error);app.exit(1)})