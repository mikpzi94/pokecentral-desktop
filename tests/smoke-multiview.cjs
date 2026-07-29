const { app, BaseWindow, WebContentsView } = require('electron')

const timeout = setTimeout(() => {
  console.error('TIMEOUT: a grade de contas não carregou em 30 segundos')
  app.exit(1)
}, 30000)

app.whenReady().then(async () => {
  const win = new BaseWindow({ width: 1200, height: 800, show: false })
  const views = [1, 2, 3, 4].map((slot) => {
    const view = new WebContentsView({
      webPreferences: {
        partition: `pokecentral-multiview-test-${slot}`,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true
      }
    })
    win.contentView.addChildView(view)
    const column = (slot - 1) % 2
    const row = Math.floor((slot - 1) / 2)
    view.setBounds({ x: column * 600, y: row * 400, width: 600, height: 400 })
    return view
  })

  await Promise.all(views.map((view) => view.webContents.loadURL('https://poke.idleworld.online/login')))
  console.log(JSON.stringify({
    ok: true,
    sessions: views.length,
    titles: views.map((view) => view.webContents.getTitle()),
    distinctSessions: new Set(views.map((view) => view.webContents.session)).size
  }))
  clearTimeout(timeout)
  for (const view of views) view.webContents.close()
  win.close()
  app.quit()
}).catch((error) => {
  console.error(error)
  clearTimeout(timeout)
  app.exit(1)
})