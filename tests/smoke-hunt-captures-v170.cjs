const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
app.whenReady().then(async()=>{
  for(const channel of ['launcher:hide-layout','launcher:update-layout','launcher:control'])ipcMain.handle(channel,()=>null)
  ipcMain.handle('launcher:show-layout',()=>[]);ipcMain.handle('launcher:inventory',()=>null);ipcMain.handle('share:copy-card',()=>null);ipcMain.handle('share:open-url',()=>null)
  const window=new BrowserWindow({width:1600,height:950,show:false,webPreferences:{preload:path.join(__dirname,'..','out','preload','index.js'),contextIsolation:true,sandbox:true}})
  await window.loadFile(path.join(__dirname,'..','out','renderer','index.html'))
  const now=new Date().toISOString(),past=new Date(Date.now()-3600000).toISOString()
  const account={id:'a1',name:'Conta 1',characterName:'MotoMoto',slot:1,status:'ready'}
  const pokemon={id:'p1',accountId:'a1',speciesId:157,species:'Typhlosion',level:100,iv:140,quality:'1.7',shiny:false,source:'assisted',importedAt:now}
  const session={id:'s1',slot:1,huntName:'Golem',pokemonName:'Typhlosion',startedAt:past,updatedAt:now,endedAt:now,kills:600,xp:9000000,gold:200000,lootValue:200000,captureValue:36000,supplyCost:50000,observedDurationMs:3600000,captures:2,shinies:0,captureAttempts:8,shinyEncounters:1,shinyCaptured:1,shinyEscaped:0,identityConfidence:'confirmed',identitySource:'active-card',dataQuality:'complete',source:'game-session'}
  await window.webContents.executeJavaScript(`localStorage.setItem('pokecentral.desktop.v1',${JSON.stringify(JSON.stringify({accounts:[account],pokemon:[pokemon],items:[],listings:[],huntSessions:[session]}))})`)
  await window.webContents.reload();await new Promise(resolve=>setTimeout(resolve,120));await window.webContents.executeJavaScript(`document.querySelectorAll('.nav-item')[3].click()`);await new Promise(resolve=>setTimeout(resolve,80));await window.webContents.executeJavaScript(`document.querySelectorAll('.hunt-tabs button')[1].click()`);await new Promise(resolve=>setTimeout(resolve,60));await window.webContents.executeJavaScript(`document.querySelectorAll('.hunt-profit-subtabs button')[1].click()`);await new Promise(resolve=>setTimeout(resolve,80))
  const history=await window.webContents.executeJavaScript(`document.querySelector('.hunt-history-table')?.textContent||''`)
  await window.webContents.executeJavaScript(`document.querySelectorAll('.hunt-profit-subtabs button')[2].click()`);await new Promise(resolve=>setTimeout(resolve,80))
  const estimate=await window.webContents.executeJavaScript(`([...document.querySelectorAll('.hunt-ranking-row')].find(row=>row.textContent.includes('Golem'))?.textContent)||''`)
  const source=fs.readFileSync(path.join(__dirname,'..','src','main','index.ts'),'utf8')
  const valid=history.includes('Typhlosion')&&history.includes('Golem')&&history.includes('$186.000')&&history.includes('Capturas: $36.000')&&history.includes('2 total')&&estimate.includes('600')&&estimate.includes('MEDIDO')&&source.includes('activePokemonObservations')&&source.includes('captureValue')
  console.log(JSON.stringify({history,estimate,valid}));window.destroy();app.exit(valid?0:1)
}).catch(error=>{console.error(error);app.exit(1)})
