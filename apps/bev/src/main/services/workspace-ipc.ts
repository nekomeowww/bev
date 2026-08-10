import type { BrowserWindow } from 'electron'
import type { OpenWorkspaceResult } from '../../shared/workspace.js'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { dialog, ipcMain } from 'electron'

import {
  workspaceCloseDocument,
  workspaceCurrent,
  workspaceDiagnosticsUpdated,
  workspaceInspectSymbol,
  workspaceLanguageStatusUpdated,
  workspaceOpen,
  workspaceReadOutline,
  workspaceReadSource,
} from '../../shared/workspace.js'
import type { WorkspaceService } from './workspace.js'

export function createWorkspaceIpcService(options: {
  window: BrowserWindow
  workspace: WorkspaceService
}): () => void {
  const { context, dispose } = createContext(ipcMain, options.window, {
    onlySameWindow: true,
  })

  const disposeCurrent = defineInvokeHandler(context, workspaceCurrent, () => options.workspace.current)
  const disposeDiagnostics = options.workspace.onDiagnostics((update) => {
    void context.emit(workspaceDiagnosticsUpdated, update)
  })
  const disposeLanguageStatus = options.workspace.onLanguageStatus((update) => {
    void context.emit(workspaceLanguageStatusUpdated, update)
  })
  const disposeOpen = defineInvokeHandler(context, workspaceOpen, async ({ path }): Promise<OpenWorkspaceResult> => {
    let selectedPath = path
    if (!selectedPath) {
      const result = await dialog.showOpenDialog(options.window, {
        properties: ['openDirectory'],
        title: 'Open workspace',
      })
      selectedPath = result.filePaths[0]
    }
    if (!selectedPath)
      return { status: 'cancelled' }
    return {
      status: 'opened',
      workspace: await options.workspace.open(selectedPath),
    }
  })
  const disposeOutline = defineInvokeHandler(
    context,
    workspaceReadOutline,
    ({ rootPath, path }) => {
      options.workspace.assertCurrentRoot(rootPath)
      return options.workspace.outline(path)
    },
  )
  const disposeCloseDocument = defineInvokeHandler(
    context,
    workspaceCloseDocument,
    ({ rootPath, path }) => {
      options.workspace.assertCurrentRoot(rootPath)
      return options.workspace.closeDocument(path)
    },
  )
  const disposeInspectSymbol = defineInvokeHandler(
    context,
    workspaceInspectSymbol,
    ({ rootPath, path, position }) => {
      options.workspace.assertCurrentRoot(rootPath)
      return options.workspace.inspectSymbol(path, position)
    },
  )
  const disposeReadSource = defineInvokeHandler(
    context,
    workspaceReadSource,
    ({ rootPath, path }) => {
      options.workspace.assertCurrentRoot(rootPath)
      return options.workspace.source(path)
    },
  )

  return () => {
    disposeDiagnostics()
    disposeLanguageStatus()
    disposeCloseDocument()
    disposeReadSource()
    disposeInspectSymbol()
    disposeOutline()
    disposeOpen()
    disposeCurrent()
    dispose('workspace window closed')
  }
}
