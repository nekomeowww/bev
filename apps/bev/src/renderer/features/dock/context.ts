import type { ShallowRef } from 'vue'
import type { useAnnotations } from '../annotations/useAnnotations'
import type { ContextReference } from '../workspace/model'
import type { useWorkspace } from '../workspace/useWorkspace'

import { inject, provide } from 'vue'

export interface BevDockContext {
  workspace: ReturnType<typeof useWorkspace>
  annotations: ReturnType<typeof useAnnotations>
  annotationMode: ShallowRef<boolean>
  beginAnnotation: (
    references: ContextReference[],
    point: { x: number, y: number },
  ) => void
  addContext: (reference: ContextReference) => void
}

const bevDockContextKey = Symbol('bev-dock-context')

export function provideBevDockContext(context: BevDockContext): void {
  provide(bevDockContextKey, context)
}

export function useBevDockContext(): BevDockContext {
  const context = inject<BevDockContext>(bevDockContextKey)
  if (!context)
    throw new Error('Bev dock context is not available')
  return context
}
