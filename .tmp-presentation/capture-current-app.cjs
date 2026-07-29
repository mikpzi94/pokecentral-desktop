const { app, BrowserWindow, desktopCapturer } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const outputDir = path.join(__dirname, 'current-captures')

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function captureWindow(win, filename) {
  const [width, height] = win.getSize()
  const mediaId = typeof win.getMediaSourceId === 'function' ? win.getMediaSourceId() : null
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: width * 2, height: height * 2 },
    fetchWindowIcons: false
  })
  const source =
    sources.find((candidate) => mediaId && candidate.id === mediaId) ||
    sources.find((candidate) => /PokeCentral Desktop/i.test(candidate.name))
  if (!source || source.thumbnail.isEmpty()) {
    throw new Error(`Janela não encontrada. Fontes: ${sources.map((item) => `${item.name} (${item.id})`).join(', ')}`)
  }
  fs.writeFileSync(path.join(outputDir, filename), source.thumbnail.toPNG())
}

app.whenReady().then(async () => {
  fs.mkdirSync(outputDir, { recursive: true })
  for (let attempt = 0; attempt < 80 && BrowserWindow.getAllWindows().length === 0; attempt += 1) {
    await wait(100)
  }
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) throw new Error('A janela principal não foi criada.')
  win.setSize(1360, 860)
  win.center()
  win.show()
  win.focus()

  await wait(5000)
  await win.webContents.executeJavaScript(
    `document.querySelector('.account-card.all-accounts-card')?.click()`
  )
  await wait(3000)
  await captureWindow(win, 'launcher-current.png')

  const captures = [
    ['Inventário', 'inventory-current.png'],
    ['Laboratório', 'laboratory-current.png'],
    ['Vitrine', 'showcase-current.png']
  ]
  for (const [title, filename] of captures) {
    await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('.nav-item')].find((item) => item.title === ${JSON.stringify(title)})?.click()`
    )
    await wait(1000)
    const image = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outputDir, filename), image.toPNG())
  }

  win.close()
  app.quit()
}).catch((error) => {
  console.error(error)
  app.exit(1)
})

require('../out/main/index.js')
