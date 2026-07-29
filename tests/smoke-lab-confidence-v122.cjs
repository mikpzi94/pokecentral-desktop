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
      contextIsolation: true,
      sandbox: true
    }
  })
  await win.loadFile(path.join(__dirname, '..', 'out', 'renderer', 'index.html'))
  const now = new Date().toISOString()
  await win.webContents.executeJavaScript(`localStorage.setItem('pokecentral.desktop.v1', JSON.stringify({
    accounts:[{id:'a1',name:'Conta 1',slot:1,status:'ready',characterName:'MotoMoto'}],
    pokemon:[
      {id:'low',accountId:'a1',speciesId:6,species:'Charizard',level:1,iv:132,quality:'1.713',stats:{hp:2,attack:2,defense:2,specialAttack:2,specialDefense:2,speed:2},source:'assisted',importedAt:'${now}'},
      {id:'ready',accountId:'a1',speciesId:76,species:'Golem',level:15,iv:140,quality:'1.526',stats:{hp:45,attack:52,defense:58,specialAttack:31,specialDefense:29,speed:34},source:'assisted',importedAt:'${now}'},
      {id:'missing',accountId:'a1',speciesId:94,species:'Gengar',level:80,iv:145,quality:'1.684',source:'assisted',importedAt:'${now}'}
    ],
    items:[],listings:[]
  }))`)
  await win.webContents.reload()
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
  await new Promise((resolve) => setTimeout(resolve, 250))
  await win.webContents.executeJavaScript(`document.querySelector('.nav-item:nth-child(2)').click()`)
  await new Promise((resolve) => setTimeout(resolve, 150))

  async function readConfidence(id) {
    return win.webContents.executeJavaScript(`(() => {
      const select = document.querySelector('.lab-selectors label:nth-child(2) select');
      select.value = '${id}';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return new Promise((resolve) => setTimeout(() => {
        const badge = document.querySelector('.lab-confidence');
        resolve({ text: badge?.textContent, className: badge?.className, detail: badge?.nextElementSibling?.textContent });
      }, 80));
    })()`)
  }

  const preliminary = await readConfidence('low')
  const high = await readConfidence('ready')
  const insufficient = await readConfidence('missing')
  const result = { preliminary, high, insufficient }
  fs.writeFileSync(path.join(__dirname, 'smoke-lab-confidence-v121-result.json'), JSON.stringify(result, null, 2))
  await win.webContents.capturePage().then((image) => fs.writeFileSync(path.join(__dirname, 'smoke-lab-confidence-v121.png'), image.toPNG()))

  const valid = preliminary.text === 'Estimativa preliminar' && preliminary.className.includes('confidence-preliminary') &&
    high.text === 'Alta confiança' && high.className.includes('confidence-high') &&
    insufficient.text === 'Dados insuficientes' && insufficient.className.includes('confidence-insufficient')
  win.destroy()
  app.exit(valid ? 0 : 1)
}).catch((error) => {
  console.error(error)
  app.exit(1)
})