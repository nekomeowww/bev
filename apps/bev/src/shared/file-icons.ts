import { defineInvokeEventa } from '@moeru/eventa'

export type FileIconColorVariant = 'dark' | 'light' | 'highContrast'
export type FileIconResourceKind = 'directory' | 'file'

export interface FileIconAssociations {
  file?: string
  folder?: string
  folderExpanded?: string
  rootFolder?: string
  rootFolderExpanded?: string
  folderNames?: Record<string, string>
  folderNamesExpanded?: Record<string, string>
  rootFolderNames?: Record<string, string>
  rootFolderNamesExpanded?: Record<string, string>
  fileExtensions?: Record<string, string>
  fileNames?: Record<string, string>
  languageIds?: Record<string, string>
}

export interface FileIconImageDefinition {
  url: string
}

export interface FileIconThemeDocument extends FileIconAssociations {
  iconDefinitions: Record<string, FileIconImageDefinition>
  light?: FileIconAssociations
  highContrast?: FileIconAssociations
  hidesExplorerArrows: boolean
  usesCurrentColor: boolean
}

export interface InstalledFileIconTheme {
  extensionId: string
  version: string
  themeId: string
  themeLabel: string
  document: FileIconThemeDocument
}

export interface FileIconExtensionRequest {
  extensionId: string
  version: string
}

export interface SelectFileIconThemeRequest extends FileIconExtensionRequest {
  themeId: string
}

export interface InstalledFileIconExtension {
  extensionId: string
  version: string
}

export interface OpenVsxFileIconThemeItem {
  extensionId: string
  version: string
  displayName: string
  description: string
  iconUrl?: string
  installed: boolean
  themeId: string
  themeLabel: string
}

export interface ResolveFileIconInput {
  path: string
  kind: FileIconResourceKind
  expanded?: boolean
  root?: boolean
  languageId?: string
}

export interface ResolvedFileIcon {
  url: string
  usesCurrentColor: boolean
}

export const fileIconThemeCurrent = defineInvokeEventa<InstalledFileIconTheme | null>(
  'bev:file-icon-theme:current',
)

export const fileIconExtensionInstall = defineInvokeEventa<InstalledFileIconExtension, FileIconExtensionRequest>(
  'bev:file-icon-extension:install',
)

export const fileIconThemeSelect = defineInvokeEventa<InstalledFileIconTheme, SelectFileIconThemeRequest>(
  'bev:file-icon-theme:select',
)

export const fileIconExtensionUninstall = defineInvokeEventa<void, FileIconExtensionRequest>(
  'bev:file-icon-extension:uninstall',
)

export const fileIconThemeSearch = defineInvokeEventa<OpenVsxFileIconThemeItem[]>(
  'bev:file-icon-theme:search',
)

export const fileIconThemeClear = defineInvokeEventa<void>(
  'bev:file-icon-theme:clear',
)
