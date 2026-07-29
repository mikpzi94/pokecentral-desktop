const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

app.whenReady().then(async () => {
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
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
  await new Promise((resolve) => setTimeout(resolve, 500))
  const metrics = await win.webContents.executeJavaScript(`({
    bodyScrollHeight: document.body.scrollHeight,
    viewportHeight: innerHeight,
    overflow: getComputedStyle(document.body).overflow,
    brokenImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).length
  })`)
  const image = await win.webContents.capturePage()
  const output = path.join(__dirname, 'ui-smoke.png')
  fs.writeFileSync(output, image.toPNG())
  console.log(JSON.stringify({ ok: true, output, ...metrics }))
  win.destroy()
  app.quit()
}).catch((error) => {
  console.error(error)
  app.exit(1)
})