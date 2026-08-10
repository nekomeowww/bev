import type { WorkspaceService } from '../services/workspace.js'
import type { FileIconThemeService } from '../services/file-icon-theme.js'

import { BrowserWindow, nativeTheme, net, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { createFileIconThemeIpcService } from '../services/file-icon-theme-ipc.js'
import { fileIconResourceScheme } from '../services/file-icon-theme.js'
import { createWorkspaceIpcService } from '../services/workspace-ipc.js'

export function createMainWindow(
  workspace: WorkspaceService,
  fileIconThemes: FileIconThemeService,
): BrowserWindow {
  const window = new BrowserWindow({
    title: 'Bev',
    width: 1320,
    height: 820,
    minWidth: 920,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#00000000',
    ...platformWindowEffects(),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  const disposeWorkspaceIpc = createWorkspaceIpcService({ window, workspace })
  const disposeFileIconThemeIpc = createFileIconThemeIpcService({ window, fileIconThemes })
  const fileIconProtocol = window.webContents.session.protocol
  if (!fileIconProtocol.isProtocolHandled(fileIconResourceScheme)) {
    void fileIconProtocol.handle(fileIconResourceScheme, (request) => {
      const assetPath = fileIconThemes.resourcePath(request.url)
      return assetPath
        ? net.fetch(pathToFileURL(assetPath).toString())
        : new Response(null, { status: 404 })
    })
  }
  window.once('closed', () => {
    disposeFileIconThemeIpc()
    disposeWorkspaceIpc()
  })
  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://'))
      void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL)
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'))

  return window
}

function platformWindowEffects(): Electron.BrowserWindowConstructorOptions {
  if (process.platform === 'darwin') {
    return {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 14, y: 14 },
      vibrancy: 'sidebar',
      visualEffectState: 'active',
    }
  }

  if (process.platform === 'win32') {
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#00000000',
        symbolColor: nativeTheme.shouldUseDarkColors ? '#f3f3f3' : '#202020',
        height: 40,
      },
      backgroundMaterial: 'acrylic',
    }
  }

  return {
    titleBarStyle: 'hidden',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#171719' : '#f2f2f4',
  }
}
