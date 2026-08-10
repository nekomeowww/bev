import type {
  OutlineSnapshot,
  SourceDocumentSnapshot,
  SourcePosition,
  SymbolInsight,
  WorkspaceSnapshot,
} from '../../../shared/workspace.js'
import type { ContextReference } from './context.js'

export type WorkspaceState =
  | { status: 'empty' }
  | { status: 'loading', previous: WorkspaceSnapshot | null }
  | { status: 'ready', workspace: WorkspaceSnapshot }
  | { status: 'error', previous: WorkspaceSnapshot | null, message: string }

export type OutlineState =
  | { status: 'unselected' }
  | { status: 'loading', path: string }
  | { status: 'ready', path: string, outline: OutlineSnapshot }
  | { status: 'error', path: string, message: string }

export type InsightState =
  | { status: 'idle' }
  | { status: 'loading', path: string, position: SourcePosition }
  | { status: 'ready', insight: SymbolInsight }
  | { status: 'error', path: string, position: SourcePosition, message: string }

export type SourcePreviewState =
  | { status: 'idle' }
  | { status: 'loading', reference: ContextReference }
  | { status: 'ready', reference: ContextReference, document: SourceDocumentSnapshot }
  | { status: 'error', reference: ContextReference, message: string }

export function currentWorkspace(state: WorkspaceState): WorkspaceSnapshot | null {
  switch (state.status) {
    case 'ready':
      return state.workspace
    case 'loading':
    case 'error':
      return state.previous
    case 'empty':
      return null
  }
}

export function selectedOutlinePath(state: OutlineState): string | null {
  return state.status === 'unselected' ? null : state.path
}

export function outlineStatusMessage(state: OutlineState): string | null {
  switch (state.status) {
    case 'unselected':
      return 'Select a source file'
    case 'loading':
      return 'Loading outline'
    case 'error':
      return state.message
    case 'ready':
      if (state.outline.analysisStatus === 'loading' && state.outline.symbols.length === 0)
        return 'Analyzing workspace'
      return state.outline.symbols.length === 0 ? 'No symbols found' : null
  }
}
