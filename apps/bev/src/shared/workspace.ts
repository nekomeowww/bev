import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export type WorkspaceEntryKind = 'directory' | 'file'

export interface WorkspaceEntry {
  name: string
  path: string
  kind: WorkspaceEntryKind
  languageId?: string
  children?: WorkspaceEntry[]
}

export interface WorkspaceSnapshot {
  rootPath: string
  rootName: string
  entries: WorkspaceEntry[]
}

export interface SourcePosition {
  line: number
  character: number
}

export interface SourceRange {
  start: SourcePosition
  end: SourcePosition
}

export interface OutlineSymbol {
  id: string
  name: string
  detail?: string
  kind: number
  kindLabel: string
  range: SourceRange
  selectionRange: SourceRange
  children: OutlineSymbol[]
}

export interface OutlineDiagnostic {
  id: string
  message: string
  range: SourceRange
  severity?: number
  source?: string
  code?: string
}

export type OutlineDiagnostics =
  | { status: 'pending' }
  | { status: 'ready', items: OutlineDiagnostic[] }

export interface OutlineSnapshot {
  path: string
  languageId: string
  symbols: OutlineSymbol[]
  diagnostics: OutlineDiagnostics
  provider: string
  capabilities: string[]
  analysisStatus: 'loading' | 'ready'
}

export interface SourceReference {
  label?: string
  path: string
  range: SourceRange
  external: boolean
}

export interface SymbolInsight {
  path: string
  position: SourcePosition
  hover?: string
  definitions: SourceReference[]
  declarations: SourceReference[]
  typeDefinitions: SourceReference[]
  implementations: SourceReference[]
  references: SourceReference[]
  incomingCalls: SourceReference[]
  outgoingCalls: SourceReference[]
  supertypes: SourceReference[]
  subtypes: SourceReference[]
}

export interface SourceDocumentSnapshot {
  path: string
  languageId: string
  content: string
}

export interface OpenWorkspaceRequest {
  path?: string
}

export type OpenWorkspaceResult =
  | { status: 'cancelled' }
  | { status: 'opened', workspace: WorkspaceSnapshot }

export interface WorkspaceDiagnosticsUpdate {
  path: string
  diagnostics: OutlineDiagnostic[]
}

export interface WorkspaceLanguageStatusUpdate {
  workspaceRoot: string
  projectRoot: string
  languageId: string
  status: 'loading' | 'ready'
}

export interface ReadOutlineRequest {
  rootPath: string
  path: string
}

export interface CloseDocumentRequest {
  rootPath: string
  path: string
}

export interface InspectSymbolRequest {
  rootPath: string
  path: string
  position: SourcePosition
}

export interface ReadSourceRequest {
  rootPath: string
  path: string
}

export const workspaceOpen = defineInvokeEventa<OpenWorkspaceResult, OpenWorkspaceRequest>(
  'bev:workspace:open',
)

export const workspaceCurrent = defineInvokeEventa<WorkspaceSnapshot | null>(
  'bev:workspace:current',
)

export const workspaceReadOutline = defineInvokeEventa<OutlineSnapshot, ReadOutlineRequest>(
  'bev:workspace:outline',
)

export const workspaceCloseDocument = defineInvokeEventa<void, CloseDocumentRequest>(
  'bev:workspace:close-document',
)

export const workspaceInspectSymbol = defineInvokeEventa<SymbolInsight, InspectSymbolRequest>(
  'bev:workspace:inspect-symbol',
)

export const workspaceReadSource = defineInvokeEventa<SourceDocumentSnapshot, ReadSourceRequest>(
  'bev:workspace:read-source',
)

export const workspaceDiagnosticsUpdated = defineEventa<WorkspaceDiagnosticsUpdate>(
  'bev:workspace:diagnostics-updated',
)

export const workspaceLanguageStatusUpdated = defineEventa<WorkspaceLanguageStatusUpdate>(
  'bev:workspace:language-status-updated',
)
