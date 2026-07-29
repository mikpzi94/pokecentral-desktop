const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')

app.whenReady().then(async () => {
  for (const channel of ['launcher:hide-layout', 'launcher:update-layout', 'launcher:control']) {
    ipcMain.handle(channel, () => null)
  }
  ipcMain.handle('launcher:show-layout', () => [])
  ipcMain.handle('launcher:inventory', () => null)
  ipcMain.handle('collection:capability', () => ({ available: true, reason: 'teste' }))

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
  await win.webContents.executeJavaScript(`localStorage.setItem('pokecentral.desktop.v1', JSON.stringify({accounts:[1,2,3,4].map(slot=>({id:'test-'+slot,name:'Conta '+slot,slot,status:'ready',characterName:'Personagem '+slot})),pokemon:[]}))`)
  await win.webContents.reload()
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button => button.textContent.includes('GRADE 2×2')).click()`)
  await new Promise((resolve) => setTimeout(resolve, 600))
  const metrics = await win.webContents.executeJavaScript(`(() => {
    const hosts = [...document.querySelectorAll('.game-host')].map((node) => {
      const rect = node.getBoundingClientRect()
      return { width: Math.round(rect.width), height: Math.round(rect.height) }
    })
    return {
      viewport: { width: innerWidth, height: innerHeight },
      body: { scrollWidth: document.body.scrollWidth, scrollHeight: document.body.scrollHeight, overflow: getComputedStyle(document.body).overflow },
      hosts,
      sidebarDisplay: getComputedStyle(document.querySelector('.sidebar')).display,
      launcherMode: document.querySelector('.launcher-page').className,
      brokenImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).length
    }
  })()`)
  console.log(JSON.stringify(metrics))
  const valid = metrics.hosts.length === 4 && metrics.body.scrollHeight === metrics.viewport.height && metrics.body.overflow === 'hidden' && metrics.sidebarDisplay === 'none' && metrics.brokenImages === 0 && metrics.hosts.every((host) => host.width > 500 && host.height > 300)
  win.destroy()
  app.exit(valid ? 0 : 1)
}).catch((error) => {
  console.error(error)
  app.exit(1)
})