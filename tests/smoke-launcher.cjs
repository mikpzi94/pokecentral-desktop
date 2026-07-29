const { app, BaseWindow, WebContentsView } = require('electron')

const timeout = setTimeout(() => {
  console.error('TIMEOUT: o login oficial não carregou em 20 segundos')
  app.exit(1)
}, 20000)

app.whenReady().then(async () => {
  const win = new BaseWindow({ width: 900, height: 700, show: false })
  const view = new WebContentsView({
    webPreferences: {
      partition: 'pokecentral-smoke-test',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  })
  win.contentView.addChildView(view)
  view.setBounds({ x: 0, y: 0, width: 900, height: 700 })
  await view.webContents.loadURL('https://poke.idleworld.online/login')
  console.log(JSON.stringify({
    ok: true,
    url: view.webContents.getURL(),
    title: view.webContents.getTitle()
  }))
  clearTimeout(timeout)
  view.webContents.close()
  win.close()
  app.quit()
}).catch((error) => {
  console.error(error)
  clearTimeout(timeout)
  app.exit(1)
})