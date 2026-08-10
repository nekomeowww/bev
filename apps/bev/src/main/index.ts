import { app, protocol } from 'electron'
import { injeca, lifecycle } from 'injeca'
import { join, resolve } from 'node:path'

import { FileIconThemeService, fileIconResourceScheme } from './services/file-icon-theme.js'
import { WorkspaceService } from './services/workspace.js'
import { createMainWindow } from './windows/main.js'

protocol.registerSchemesAsPrivileged([{
  scheme: fileIconResourceScheme,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
  },
}])

const remoteDebugPort = process.env.BEV_REMOTE_DEBUG_PORT?.trim()
if (remoteDebugPort)
  app.commandLine.appendSwitch('remote-debugging-port', remoteDebugPort)

let getMainWindow: (() => Electron.BrowserWindow) | undefined
let shutdownStarted = false

app.whenReady().then(async () => {
  const electronApp = injeca.provide('host:electron:app', () => app)
  const workspace = injeca.provide('services:workspace', {
    dependsOn: { lifecycle },
    build: ({ dependsOn }) => {
      const service = new WorkspaceService()
      dependsOn.lifecycle.appHooks.onStop(() => service.dispose())
      return service
    },
  })
  const fileIconThemes = injeca.provide('services:file-icon-themes', () => new FileIconThemeService({
    cacheRoot: join(app.getPath('userData'), 'file-icon-themes'),
  }))

  const mainWindow = injeca.provide('windows:main', {
    dependsOn: { electronApp, fileIconThemes, workspace },
    build: ({ dependsOn }) => {
      let window: Electron.BrowserWindow | undefined
      return () => {
        if (!window || window.isDestroyed())
          window = createMainWindow(dependsOn.workspace, dependsOn.fileIconThemes)
        return window
      }
    },
  })

  injeca.invoke({
    dependsOn: { mainWindow, workspace },
    callback: async ({ mainWindow, workspace }) => {
      getMainWindow = mainWindow
      const initialWorkspace = process.env.BEV_WORKSPACE?.trim()
        || (process.env.ELECTRON_RENDERER_URL
          ? resolve(import.meta.dirname, '../../../..')
          : undefined)
      if (initialWorkspace)
        await workspace.open(initialWorkspace)

      mainWindow()
    },
  })

  await injeca.start()
}).catch((error) => {
  console.error('Failed to start Bev', error)
  app.quit()
})

app.on('activate', () => {
  getMainWindow?.().show()
})

app.on('before-quit', (event) => {
  if (shutdownStarted)
    return

  event.preventDefault()
  shutdownStarted = true
  void injeca.stop().finally(() => app.quit())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin')
    app.quit()
})
