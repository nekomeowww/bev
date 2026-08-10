import type { SourceDocumentSnapshot, SourceReference } from '../../../shared/workspace'
import type { ContextReference } from './context'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { computed, onMounted, onScopeDispose, shallowReadonly, shallowRef, watch } from 'vue'

import {
  workspaceCloseDocument,
  workspaceCurrent,
  workspaceDiagnosticsUpdated,
  workspaceInspectSymbol,
  workspaceLanguageStatusUpdated,
  workspaceOpen,
  workspaceReadOutline,
  workspaceReadSource,
} from '../../../shared/workspace'
import { closeTab, openPreviewTab, pinTab, restorePinnedTab } from './editorTabs'
import {
  currentWorkspace,
  type InsightState,
  type OutlineState,
  type SourcePreviewState,
  type WorkspaceState,
} from './state'

export function useWorkspace() {
  const workspaceState = shallowRef<WorkspaceState>({ status: 'empty' })
  const outlineStates = shallowRef(new Map<string, OutlineState>())
  const openPaths = shallowRef<string[]>([])
  const previewPath = shallowRef<string | null>(null)
  const activePath = shallowRef<string | null>(null)
  const insightState = shallowRef<InsightState>({ status: 'idle' })
  const sourcePreviewState = shallowRef<SourcePreviewState>({ status: 'idle' })
  const detailReference = shallowRef<ContextReference | null>(null)
  const pinnedReference = shallowRef<ContextReference | null>(null)
  const sourceCache = new Map<string, SourceDocumentSnapshot>()
  const outlineRequests = new Map<string, number>()
  let nextOutlineRequest = 0
  let workspaceRequest = 0
  let insightRequest = 0
  let sourceRequest = 0
  let previewClearTimer: ReturnType<typeof setTimeout> | undefined

  const { context, dispose } = createContext(window.bev.ipcRenderer)
  const getCurrentWorkspace = defineInvoke(context, workspaceCurrent)
  const openWorkspaceInvoke = defineInvoke(context, workspaceOpen)
  const readOutline = defineInvoke(context, workspaceReadOutline)
  const closeDocument = defineInvoke(context, workspaceCloseDocument)
  const readSource = defineInvoke(context, workspaceReadSource)
  const inspectSymbolInvoke = defineInvoke(context, workspaceInspectSymbol)

  const workspace = computed(() => currentWorkspace(workspaceState.value))
  const title = computed(() => {
    const snapshot = workspace.value
    return snapshot === null ? 'Workspace' : snapshot.rootName
  })
  const outlineState = computed<OutlineState>(() => {
    const path = activePath.value
    if (path === null)
      return { status: 'unselected' }
    const state = outlineStates.value.get(path)
    return state === undefined ? { status: 'loading', path } : state
  })

  watch(
    () => {
      const snapshot = workspace.value
      return snapshot === null ? null : snapshot.rootPath
    },
    (rootPath) => {
      if (rootPath === null)
        return
      for (const path of openPaths.value)
        void loadOutline(path)
    },
  )

  const stopDiagnostics = context.on(workspaceDiagnosticsUpdated, ({ body }) => {
    if (body === undefined)
      return
    const state = outlineStates.value.get(body.path)
    if (state?.status !== 'ready')
      return

    replaceOutlineState(body.path, {
      ...state,
      outline: {
        ...state.outline,
        diagnostics: { status: 'ready', items: body.diagnostics },
      },
    })
  })

  const stopLanguageStatus = context.on(workspaceLanguageStatusUpdated, ({ body }) => {
    if (body === undefined || body.status !== 'ready')
      return
    const snapshot = workspace.value
    if (snapshot === null || snapshot.rootPath !== body.workspaceRoot)
      return

    for (const [path, state] of outlineStates.value) {
      if (
        openPaths.value.includes(path)
        && state.status === 'ready'
        && state.outline.languageId === body.languageId
        && state.outline.analysisStatus === 'loading'
      ) {
        void loadOutline(path, true)
      }
    }
  })

  async function openWorkspace(path?: string): Promise<boolean> {
    const request = ++workspaceRequest
    const previous = currentWorkspace(workspaceState.value)
    workspaceState.value = { status: 'loading', previous }

    try {
      const result = await openWorkspaceInvoke(path === undefined ? {} : { path })
      if (request !== workspaceRequest)
        return false

      if (result.status === 'cancelled') {
        workspaceState.value = previous === null
          ? { status: 'empty' }
          : { status: 'ready', workspace: previous }
        return false
      }

      resetEditors()
      workspaceState.value = { status: 'ready', workspace: result.workspace }
      return true
    }
    catch (cause) {
      if (request === workspaceRequest) {
        workspaceState.value = {
          status: 'error',
          previous,
          message: messageFrom(cause),
        }
      }
      return false
    }
  }

  function openFile(path: string): void {
    const result = openPreviewTab({
      openPaths: openPaths.value,
      previewPath: previewPath.value,
    }, path)
    openPaths.value = result.openPaths
    previewPath.value = result.previewPath
    if (result.evictedPath !== null)
      releaseFile(result.evictedPath)
    activateFile(path)
    void loadOutline(path)
  }

  function restoreFile(path: string): void {
    const result = restorePinnedTab({
      openPaths: openPaths.value,
      previewPath: previewPath.value,
    }, path)
    openPaths.value = result.openPaths
    previewPath.value = result.previewPath
    if (workspace.value !== null)
      void loadOutline(path)
  }

  function pinFile(path: string): void {
    const result = pinTab({
      openPaths: openPaths.value,
      previewPath: previewPath.value,
    }, path)
    openPaths.value = result.openPaths
    previewPath.value = result.previewPath
  }

  function activateFile(path: string): void {
    if (activePath.value === path)
      return
    activePath.value = path
    closeDetails()
  }

  function closeFile(path: string): void {
    const index = openPaths.value.indexOf(path)
    if (index < 0)
      return
    const result = closeTab({
      openPaths: openPaths.value,
      previewPath: previewPath.value,
    }, path)
    openPaths.value = result.openPaths
    previewPath.value = result.previewPath
    releaseFile(path)
    if (activePath.value !== path)
      return
    const nextPath = result.openPaths[Math.min(index, result.openPaths.length - 1)]
    activePath.value = nextPath === undefined ? null : nextPath
    closeDetails()
  }

  function releaseFile(path: string): void {
    outlineRequests.delete(path)
    removeOutlineState(path)
    const snapshot = workspace.value
    if (snapshot !== null)
      void closeDocument({ rootPath: snapshot.rootPath, path })
  }

  async function loadOutline(path: string, force = false): Promise<void> {
    const current = outlineStates.value.get(path)
    if (current?.status === 'loading' || (current?.status === 'ready' && !force))
      return

    const request = ++nextOutlineRequest
    outlineRequests.set(path, request)
    replaceOutlineState(path, { status: 'loading', path })

    try {
      const snapshot = workspace.value
      if (snapshot === null)
        throw new Error('Open a workspace before loading a source file')
      const outline = await readOutline({ rootPath: snapshot.rootPath, path })
      if (outlineRequests.get(path) !== request)
        return
      if (outline.path !== path)
        throw new Error(`Received outline for ${outline.path} while loading ${path}`)
      replaceOutlineState(path, { status: 'ready', path, outline })
    }
    catch (cause) {
      if (outlineRequests.get(path) === request) {
        replaceOutlineState(path, {
          status: 'error',
          path,
          message: messageFrom(cause),
        })
      }
    }
  }

  function previewReference(reference: ContextReference): void {
    if (pinnedReference.value)
      return
    cancelPreviewClear()
    detailReference.value = reference
    void loadSourcePreview(reference)
  }

  function clearPreview(reference: ContextReference): void {
    if (pinnedReference.value || detailReference.value?.id !== reference.id)
      return
    schedulePreviewClear(reference)
  }

  function holdPreview(): void {
    cancelPreviewClear()
  }

  function releasePreview(): void {
    const reference = detailReference.value
    if (reference === null || pinnedReference.value !== null)
      return
    schedulePreviewClear(reference)
  }

  function inspectReference(reference: ContextReference): void {
    const range = reference.selectionRange === undefined
      ? reference.range
      : reference.selectionRange
    if (!range)
      return

    pinnedReference.value = reference
    detailReference.value = reference
    void loadSourcePreview(reference)
    void inspectSymbol(reference.path, range.start)
  }

  async function inspectSymbol(path: string, position: { line: number, character: number }): Promise<void> {
    const request = ++insightRequest
    insightState.value = { status: 'loading', path, position }

    try {
      const snapshot = workspace.value
      if (snapshot === null)
        throw new Error('Open a workspace before inspecting a symbol')
      const insight = await inspectSymbolInvoke({ rootPath: snapshot.rootPath, path, position })
      if (request === insightRequest)
        insightState.value = { status: 'ready', insight }
    }
    catch (cause) {
      if (request === insightRequest) {
        insightState.value = {
          status: 'error',
          path,
          position,
          message: messageFrom(cause),
        }
      }
    }
  }

  async function loadSourcePreview(reference: ContextReference): Promise<void> {
    const request = ++sourceRequest
    const cached = sourceCache.get(reference.path)
    if (cached) {
      sourcePreviewState.value = { status: 'ready', reference, document: cached }
      return
    }

    sourcePreviewState.value = { status: 'loading', reference }
    try {
      const snapshot = workspace.value
      if (snapshot === null)
        throw new Error('Open a workspace before reading source')
      const document = await readSource({ rootPath: snapshot.rootPath, path: reference.path })
      sourceCache.set(reference.path, document)
      if (request === sourceRequest && detailReference.value?.id === reference.id)
        sourcePreviewState.value = { status: 'ready', reference, document }
    }
    catch (cause) {
      if (request === sourceRequest && detailReference.value?.id === reference.id) {
        sourcePreviewState.value = {
          status: 'error',
          reference,
          message: messageFrom(cause),
        }
      }
    }
  }

  function openSourceReference(reference: SourceReference): void {
    if (!reference.external)
      openFile(reference.path)
  }

  function closeDetails(): void {
    cancelPreviewClear()
    insightRequest += 1
    sourceRequest += 1
    pinnedReference.value = null
    detailReference.value = null
    insightState.value = { status: 'idle' }
    sourcePreviewState.value = { status: 'idle' }
  }

  function replaceOutlineState(path: string, state: OutlineState): void {
    const next = new Map(outlineStates.value)
    next.set(path, state)
    outlineStates.value = next
  }

  function removeOutlineState(path: string): void {
    if (!outlineStates.value.has(path))
      return
    const next = new Map(outlineStates.value)
    next.delete(path)
    outlineStates.value = next
  }

  function reloadOutline(path: string): void {
    void loadOutline(path, true)
  }

  function schedulePreviewClear(reference: ContextReference): void {
    cancelPreviewClear()
    previewClearTimer = setTimeout(() => {
      previewClearTimer = undefined
      if (pinnedReference.value !== null || detailReference.value?.id !== reference.id)
        return
      detailReference.value = null
      sourcePreviewState.value = { status: 'idle' }
    }, 160)
  }

  function cancelPreviewClear(): void {
    if (previewClearTimer === undefined)
      return
    clearTimeout(previewClearTimer)
    previewClearTimer = undefined
  }

  function resetEditors(): void {
    outlineRequests.clear()
    outlineStates.value = new Map()
    openPaths.value = []
    previewPath.value = null
    activePath.value = null
    sourceCache.clear()
    closeDetails()
  }

  onMounted(async () => {
    const request = ++workspaceRequest
    try {
      const snapshot = await getCurrentWorkspace()
      if (request !== workspaceRequest)
        return
      workspaceState.value = snapshot === null
        ? { status: 'empty' }
        : { status: 'ready', workspace: snapshot }
    }
    catch (cause) {
      if (request === workspaceRequest) {
        workspaceState.value = {
          status: 'error',
          previous: null,
          message: messageFrom(cause),
        }
      }
    }
  })

  onScopeDispose(() => {
    cancelPreviewClear()
    stopDiagnostics()
    stopLanguageStatus()
    dispose('workspace composable disposed')
  })

  return {
    workspaceState: shallowReadonly(workspaceState),
    outlineStates: shallowReadonly(outlineStates),
    outlineState,
    openPaths: shallowReadonly(openPaths),
    previewPath: shallowReadonly(previewPath),
    activePath: shallowReadonly(activePath),
    insightState: shallowReadonly(insightState),
    sourcePreviewState: shallowReadonly(sourcePreviewState),
    detailReference: shallowReadonly(detailReference),
    pinnedReference: shallowReadonly(pinnedReference),
    workspace,
    title,
    openWorkspace,
    openFile,
    restoreFile,
    pinFile,
    activateFile,
    closeFile,
    previewReference,
    clearPreview,
    holdPreview,
    releasePreview,
    inspectReference,
    reloadOutline,
    openSourceReference,
    closeDetails,
  }
}

function messageFrom(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
