const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

app.whenReady().then(async () => {
  for (const channel of ['launcher:hide-layout', 'launcher:update-layout', 'launcher:control']) {
    ipcMain.handle(channel, () => null)
  }
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
  await win.webContents.executeJavaScript(`localStorage.removeItem('pokecentral.sidebar.collapsed')`)
  await win.webContents.reload()
  await new Promise((resolve) => setTimeout(resolve, 250))
  await win.webContents.capturePage().then((image) => fs.writeFileSync(path.join(__dirname, 'sidebar-expanded-v10.png'), image.toPNG()))
  const expanded = await win.webContents.executeJavaScript(`({
    width: document.querySelector('.sidebar').getBoundingClientRect().width,
    labels: [...document.querySelectorAll('.nav-item > span')].every((item) => getComputedStyle(item).display !== 'none'),
    accountText: getComputedStyle(document.querySelector('.account-card > span:not(.status-dot):not(.account-open-hint)')).display !== 'none'
  })`)
  await win.webContents.executeJavaScript(`document.querySelector('.sidebar-toggle').click()`)
  await new Promise((resolve) => setTimeout(resolve, 350))
  await win.webContents.capturePage().then((image) => fs.writeFileSync(path.join(__dirname, 'sidebar-collapsed-v10.png'), image.toPNG()))
  const collapsed = await win.webContents.executeJavaScript(`({
    width: document.querySelector('.sidebar').getBoundingClientRect().width,
    labelsHidden: [...document.querySelectorAll('.nav-item > span')].every((item) => getComputedStyle(item).display === 'none'),
    accountTextHidden: getComputedStyle(document.querySelector('.account-card > span:not(.status-dot):not(.account-open-hint)')).display === 'none',
    persisted: localStorage.getItem('pokecentral.sidebar.collapsed'),
    toggleLabel: document.querySelector('.sidebar-toggle').getAttribute('aria-label')
  })`)
  fs.writeFileSync(path.join(__dirname, 'sidebar-v10-result.json'), JSON.stringify({ expanded, collapsed }, null, 2))
  win.destroy()
  app.exit(0)
}).catch((error) => {
  console.error(error)
  app.exit(1)
})
