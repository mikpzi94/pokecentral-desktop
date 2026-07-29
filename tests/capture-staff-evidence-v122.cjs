const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

app.whenReady().then(async () => {
  for (const channel of ['launcher:hide-layout', 'launcher:update-layout', 'launcher:control']) ipcMain.handle(channel, () => null)
  ipcMain.handle('launcher:show-layout', () => [])
  ipcMain.handle('launcher:inventory', () => null)
  ipcMain.handle('share:copy-card', () => null)
  ipcMain.handle('share:open-url', () => null)

  const win = new BrowserWindow({
    width: 1500,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'out', 'preload', 'index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })

  await win.loadFile(path.join(__dirname, '..', 'out', 'renderer', 'index.html'))
  const now = new Date().toISOString()
  await win.webContents.executeJavaScript(`
    localStorage.setItem('pokecentral.showcase.profile.v1', JSON.stringify({whatsapp:'5511999999999',discordUsername:'motomoto',discordUserId:'123456789012345678',preferredContact:'whatsapp'}));
    localStorage.setItem('pokecentral.desktop.v1', JSON.stringify({
      accounts:[
        {id:'a1',name:'Conta 1',slot:1,status:'ready',characterName:'MotoMoto'},
        {id:'a2',name:'Conta 2',slot:2,status:'ready',characterName:'GengarBR'},
        {id:'a3',name:'Conta 3',slot:3,status:'ready',characterName:'TreinadorAzul'},
        {id:'a4',name:'Conta 4',slot:4,status:'ready',characterName:'TreinadoraRoxa'}
      ],
      pokemon:[
        {id:'golem',accountId:'a1',speciesId:76,species:'Golem',level:585,iv:140,quality:'1.526',shiny:false,power:9896,stats:{hp:1136,attack:1444,defense:1542,specialAttack:796,specialDefense:632,speed:935},source:'assisted',importedAt:'${now}'},
        {id:'charizard',accountId:'a1',speciesId:6,species:'Charizard',level:1,iv:132,quality:'1.713',shiny:false,power:21,stats:{hp:2,attack:2,defense:2,specialAttack:2,specialDefense:2,speed:2},source:'assisted',importedAt:'${now}'},
        {id:'bulbasaur',accountId:'a2',speciesId:1,species:'Bulbasaur',level:20,iv:95,quality:'0.952',shiny:false,power:92,stats:{hp:18,attack:15,defense:16,specialAttack:19,specialDefense:18,speed:14},source:'assisted',importedAt:'${now}'}
      ],
      items:[],
      listings:[{id:'listing-golem',pokemonId:'golem',accountId:'a1',pokemon:{id:'golem',accountId:'a1',speciesId:76,species:'Golem',level:585,iv:140,quality:'1.526',shiny:false,power:9896,stats:{hp:1136,attack:1444,defense:1542,specialAttack:796,specialDefense:632,speed:935},source:'assisted',importedAt:'${now}'},price:25,negotiable:true,status:'active',createdAt:'${now}',updatedAt:'${now}'}]
    }));
  `)
  await win.webContents.reload()
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
  await wait(500)

  const evidenceDir = path.join(__dirname, '..', 'docs', 'AUTORIZACAO_STAFF_0.12.2', 'EVIDENCIAS')
  fs.mkdirSync(evidenceDir, { recursive: true })
  const capture = async (name) => fs.writeFileSync(path.join(evidenceDir, name), (await win.webContents.capturePage()).toPNG())

  await win.webContents.executeJavaScript(`document.querySelector('[title="Inventário"]').click()`)
  await wait(350)
  await capture('01-inventario.png')

  await win.webContents.executeJavaScript(`document.querySelector('[title="Laboratório"]').click()`)
  await wait(350)
  await capture('02-laboratorio.png')

  await win.webContents.executeJavaScript(`document.querySelector('[title="Vitrine"]').click()`)
  await wait(350)
  await capture('03-vitrine-local.png')

  await win.webContents.executeJavaScript(`document.querySelector('[title="Todas as contas em grade"]').click()`)
  await wait(350)
  await capture('04-launcher-grade.png')

  fs.writeFileSync(path.join(evidenceDir, 'capturas.json'), JSON.stringify({version:'0.12.2',viewport:'1500x900',generatedAt:new Date().toISOString(),files:['01-inventario.png','02-laboratorio.png','03-vitrine-local.png','04-launcher-grade.png']}, null, 2))
  win.destroy()
  app.exit(0)
}).catch((error) => { console.error(error); app.exit(1) })