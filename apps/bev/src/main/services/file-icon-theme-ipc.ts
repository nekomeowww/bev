import type { BrowserWindow } from 'electron'
import type { FileIconThemeService } from './file-icon-theme.js'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

import {
  fileIconExtensionInstall,
  fileIconExtensionUninstall,
  fileIconThemeClear,
  fileIconThemeCurrent,
  fileIconThemeSearch,
  fileIconThemeSelect,
} from '../../shared/file-icons.js'

export function createFileIconThemeIpcService(options: {
  window: BrowserWindow
  fileIconThemes: FileIconThemeService
}): () => void {
  const { context, dispose } = createContext(ipcMain, options.window, {
    onlySameWindow: true,
  })
  const disposeCurrent = defineInvokeHandler(
    context,
    fileIconThemeCurrent,
    () => options.fileIconThemes.current(),
  )
  const disposeInstall = defineInvokeHandler(
    context,
    fileIconExtensionInstall,
    ({ extensionId, version }) => options.fileIconThemes.installExtension(extensionId, version),
  )
  const disposeSelect = defineInvokeHandler(
    context,
    fileIconThemeSelect,
    ({ extensionId, version, themeId }) => options.fileIconThemes.selectTheme(extensionId, version, themeId),
  )
  const disposeUninstall = defineInvokeHandler(
    context,
    fileIconExtensionUninstall,
    ({ extensionId, version }) => options.fileIconThemes.uninstallExtension(extensionId, version),
  )
  const disposeSearch = defineInvokeHandler(
    context,
    fileIconThemeSearch,
    () => options.fileIconThemes.search(),
  )
  const disposeClear = defineInvokeHandler(
    context,
    fileIconThemeClear,
    () => options.fileIconThemes.clear(),
  )

  return () => {
    disposeClear()
    disposeSearch()
    disposeUninstall()
    disposeSelect()
    disposeInstall()
    disposeCurrent()
    dispose('file icon theme window closed')
  }
}
