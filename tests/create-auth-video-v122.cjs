const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const scale = Math.max(0.01, Number(process.argv[2] || 1))
const output = process.argv[3] || path.join(__dirname, '..', 'docs', 'AUTORIZACAO_STAFF_0.12.2', 'VIDEO_DEMONSTRACAO_POKECENTRAL_0.12.2.webm')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false }
  })
  ipcMain.once('video:done', (_event, result) => {
    if (!result.ok) console.error(result.error)
    win.destroy()
    app.exit(result.ok ? 0 : 1)
  })
  await win.loadFile(path.join(__dirname, 'auth-video-recorder.html'))
  win.webContents.send('video:config', {
    scale,
    output,
    images: {
      inventory: pathToFileURL(path.join(__dirname, '..', 'docs', 'AUTORIZACAO_STAFF_0.12.2', 'EVIDENCIAS', '01-inventario.png')).href,
      lab: pathToFileURL(path.join(__dirname, '..', 'docs', 'AUTORIZACAO_STAFF_0.12.2', 'EVIDENCIAS', '02-laboratorio.png')).href,
      showcase: pathToFileURL(path.join(__dirname, '..', 'docs', 'AUTORIZACAO_STAFF_0.12.2', 'EVIDENCIAS', '03-vitrine-local.png')).href,
      launcher: pathToFileURL(path.join(__dirname, '..', 'docs', 'AUTORIZACAO_STAFF_0.12.2', 'EVIDENCIAS', '04-launcher-grade.png')).href
    }
  })
}).catch((error) => { console.error(error); app.exit(1) })