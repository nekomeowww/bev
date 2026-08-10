import type {
  FileIconColorVariant,
  InstalledFileIconTheme,
  OpenVsxFileIconThemeItem,
  ResolveFileIconInput,
  ResolvedFileIcon,
} from '../../../shared/file-icons'
import type { ComputedRef, InjectionKey, ShallowRef } from 'vue'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import {
  computed,
  inject,
  onMounted,
  onScopeDispose,
  provide,
  shallowReadonly,
  shallowRef,
} from 'vue'

import {
  fileIconExtensionInstall,
  fileIconExtensionUninstall,
  fileIconThemeClear,
  fileIconThemeCurrent,
  fileIconThemeSearch,
  fileIconThemeSelect,
} from '../../../shared/file-icons'
import { resolveFileIcon } from './resolver'

export type FileIconThemeStatus = 'idle' | 'loading' | 'ready' | 'error'
export type FileIconCatalogStatus = 'idle' | 'loading' | 'ready' | 'error'
export type FileIconExtensionActionKind = 'installing' | 'selecting' | 'uninstalling'

export interface FileIconExtensionAction {
  extensionId: string
  version: string
  kind: FileIconExtensionActionKind
  themeId?: string
}

export interface FileIconThemeContext {
  theme: Readonly<ShallowRef<InstalledFileIconTheme | null>>
  status: Readonly<ShallowRef<FileIconThemeStatus>>
  error: Readonly<ShallowRef<string | null>>
  catalog: Readonly<ShallowRef<OpenVsxFileIconThemeItem[]>>
  catalogStatus: Readonly<ShallowRef<FileIconCatalogStatus>>
  catalogError: Readonly<ShallowRef<string | null>>
  extensionAction: Readonly<ShallowRef<FileIconExtensionAction | null>>
  hidesExplorerArrows: ComputedRef<boolean>
  installExtension: (extensionId: string, version: string) => Promise<boolean>
  selectTheme: (extensionId: string, version: string, themeId: string) => Promise<boolean>
  uninstallExtension: (extensionId: string, version: string) => Promise<boolean>
  loadCatalog: (force?: boolean) => Promise<void>
  clear: () => Promise<void>
  resolveIcon: (input: ResolveFileIconInput) => ResolvedFileIcon | null
}

const fileIconThemeContextKey: InjectionKey<FileIconThemeContext> = Symbol('file-icon-theme')

export function useFileIconTheme(): FileIconThemeContext {
  const theme = shallowRef<InstalledFileIconTheme | null>(null)
  const status = shallowRef<FileIconThemeStatus>('idle')
  const error = shallowRef<string | null>(null)
  const colorVariant = shallowRef<FileIconColorVariant>('dark')
  const catalog = shallowRef<OpenVsxFileIconThemeItem[]>([])
  const catalogStatus = shallowRef<FileIconCatalogStatus>('idle')
  const catalogError = shallowRef<string | null>(null)
  const extensionAction = shallowRef<FileIconExtensionAction | null>(null)
  const { context, dispose } = createContext(window.bev.ipcRenderer)
  const getCurrent = defineInvoke(context, fileIconThemeCurrent)
  const installInvoke = defineInvoke(context, fileIconExtensionInstall)
  const selectInvoke = defineInvoke(context, fileIconThemeSelect)
  const uninstallInvoke = defineInvoke(context, fileIconExtensionUninstall)
  const searchInvoke = defineInvoke(context, fileIconThemeSearch)
  const clearInvoke = defineInvoke(context, fileIconThemeClear)
  const darkMedia = window.matchMedia('(prefers-color-scheme: dark)')
  const contrastMedia = window.matchMedia('(forced-colors: active)')
  const hidesExplorerArrows = computed(() => theme.value?.document.hidesExplorerArrows === true)

  function updateColorVariant(): void {
    colorVariant.value = contrastMedia.matches
      ? 'highContrast'
      : darkMedia.matches
        ? 'dark'
        : 'light'
  }

  async function loadCurrent(): Promise<void> {
    status.value = 'loading'
    error.value = null
    try {
      theme.value = await getCurrent()
      status.value = theme.value ? 'ready' : 'idle'
    }
    catch (cause) {
      status.value = 'error'
      error.value = messageFrom(cause)
    }
  }

  async function installExtension(extensionId: string, version: string): Promise<boolean> {
    extensionAction.value = { extensionId, version, kind: 'installing' }
    error.value = null
    try {
      await installInvoke({ extensionId, version })
      setCatalogInstallation(extensionId, version, true)
      return true
    }
    catch (cause) {
      error.value = messageFrom(cause)
      return false
    }
    finally {
      extensionAction.value = null
    }
  }

  async function selectTheme(extensionId: string, version: string, themeId: string): Promise<boolean> {
    extensionAction.value = { extensionId, version, themeId, kind: 'selecting' }
    error.value = null
    try {
      theme.value = await selectInvoke({ extensionId, version, themeId })
      status.value = 'ready'
      return true
    }
    catch (cause) {
      error.value = messageFrom(cause)
      return false
    }
    finally {
      extensionAction.value = null
    }
  }

  async function uninstallExtension(extensionId: string, version: string): Promise<boolean> {
    extensionAction.value = { extensionId, version, kind: 'uninstalling' }
    error.value = null
    try {
      await uninstallInvoke({ extensionId, version })
      setCatalogInstallation(extensionId, version, false)
      if (theme.value?.extensionId === extensionId && theme.value.version === version) {
        theme.value = null
        status.value = 'idle'
      }
      return true
    }
    catch (cause) {
      error.value = messageFrom(cause)
      return false
    }
    finally {
      extensionAction.value = null
    }
  }

  function setCatalogInstallation(extensionId: string, version: string, installed: boolean): void {
    catalog.value = catalog.value.map(item => (
      item.extensionId === extensionId && item.version === version
        ? { ...item, installed }
        : item
    ))
  }

  async function loadCatalog(force = false): Promise<void> {
    if (!force && (catalogStatus.value === 'loading' || catalogStatus.value === 'ready'))
      return
    catalogStatus.value = 'loading'
    catalogError.value = null
    try {
      catalog.value = await searchInvoke()
      catalogStatus.value = 'ready'
    }
    catch (cause) {
      catalogStatus.value = 'error'
      catalogError.value = messageFrom(cause)
    }
  }

  async function clear(): Promise<void> {
    await clearInvoke()
    theme.value = null
    error.value = null
    status.value = 'idle'
  }

  function resolveIcon(input: ResolveFileIconInput): ResolvedFileIcon | null {
    const current = theme.value
    return current
      ? resolveFileIcon(current.document, input, colorVariant.value)
      : null
  }

  onMounted(() => {
    updateColorVariant()
    darkMedia.addEventListener('change', updateColorVariant)
    contrastMedia.addEventListener('change', updateColorVariant)
    void loadCurrent()
  })
  onScopeDispose(() => {
    darkMedia.removeEventListener('change', updateColorVariant)
    contrastMedia.removeEventListener('change', updateColorVariant)
    dispose('file icon theme scope disposed')
  })

  return {
    theme: shallowReadonly(theme),
    status: shallowReadonly(status),
    error: shallowReadonly(error),
    catalog: shallowReadonly(catalog),
    catalogStatus: shallowReadonly(catalogStatus),
    catalogError: shallowReadonly(catalogError),
    extensionAction: shallowReadonly(extensionAction),
    hidesExplorerArrows,
    installExtension,
    selectTheme,
    uninstallExtension,
    loadCatalog,
    clear,
    resolveIcon,
  }
}

export function provideFileIconTheme(context: FileIconThemeContext): void {
  provide(fileIconThemeContextKey, context)
}

export function useFileIconThemeContext(): FileIconThemeContext {
  const context = inject(fileIconThemeContextKey)
  if (!context)
    throw new Error('File icon theme context is not available')
  return context
}

function messageFrom(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
