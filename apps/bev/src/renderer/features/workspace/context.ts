import type { SourceRange } from '../../../shared/workspace.js'

export type ContextReferenceKind = 'file' | 'symbol'

export interface ContextReference {
  id: string
  kind: ContextReferenceKind
  label: string
  path: string
  languageId?: string
  range?: SourceRange
  selectionRange?: SourceRange
  symbolKind?: string
}

export interface Annotation {
  id: string
  note: string
  targets: ContextReference[]
  context: ContextReference[]
  createdAt: string
}
