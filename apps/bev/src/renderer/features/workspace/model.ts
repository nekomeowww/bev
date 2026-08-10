import type { OutlineDiagnostic, OutlineSymbol } from '../../../shared/workspace.js'
import type { ContextReference } from './context.js'

export type { Annotation, ContextReference, ContextReferenceKind } from './context.js'

export interface VisibleWorkspaceEntry {
  name: string
  path: string
  kind: 'directory' | 'file'
  languageId?: string
  depth: number
  expanded: boolean
  hasChildren: boolean
}

export function symbolReference(
  path: string,
  languageId: string,
  symbol: OutlineSymbol,
): ContextReference {
  return {
    id: `symbol:${path}:${symbol.id}`,
    kind: 'symbol',
    label: symbol.name,
    path,
    languageId,
    range: symbol.range,
    selectionRange: symbol.selectionRange,
    symbolKind: symbol.kindLabel,
  }
}

export function fileReference(path: string, languageId?: string): ContextReference {
  const fileName = path.split('/').at(-1)
  return {
    id: `file:${path}`,
    kind: 'file',
    label: fileName === undefined ? path : fileName,
    path,
    ...(languageId ? { languageId } : {}),
  }
}

export function diagnosticReference(
  path: string,
  languageId: string,
  diagnostic: OutlineDiagnostic,
): ContextReference {
  return {
    id: `diagnostic:${path}:${diagnostic.id}`,
    kind: 'symbol',
    label: diagnostic.message,
    path,
    languageId,
    range: diagnostic.range,
    selectionRange: diagnostic.range,
    symbolKind: 'Diagnostic',
  }
}

export function writeContextDrag(event: DragEvent, reference: ContextReference): void {
  event.dataTransfer?.setData('application/x-bev-context', JSON.stringify(reference))
  event.dataTransfer?.setData('text/plain', reference.path)
  if (event.dataTransfer)
    event.dataTransfer.effectAllowed = 'copy'
}

export function readContextDrag(event: DragEvent): ContextReference | null {
  const raw = event.dataTransfer?.getData('application/x-bev-context')
  if (!raw)
    return null
  try {
    return JSON.parse(raw) as ContextReference
  }
  catch {
    return null
  }
}
