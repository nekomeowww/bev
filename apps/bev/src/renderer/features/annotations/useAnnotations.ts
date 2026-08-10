import type { Annotation, ContextReference } from '../workspace/context.js'

import { computed, shallowReadonly, shallowRef } from 'vue'

export interface AnnotationAnchor {
  x: number
  y: number
}

export function useAnnotations() {
  const annotations = shallowRef<Annotation[]>([])
  const targets = shallowRef<ContextReference[]>([])
  const context = shallowRef<ContextReference[]>([])
  const anchor = shallowRef<AnnotationAnchor>({ x: 0, y: 0 })
  const open = shallowRef(false)

  const targetIds = computed(() => new Set(targets.value.map(target => target.id)))

  function begin(nextTargets: ContextReference[], nextAnchor: AnnotationAnchor): void {
    targets.value = deduplicate(nextTargets)
    context.value = []
    anchor.value = nextAnchor
    open.value = true
  }

  function close(): void {
    resetDraft()
  }

  function addContext(reference: ContextReference): void {
    context.value = deduplicate([...context.value, reference])
  }

  function removeContext(id: string): void {
    context.value = context.value.filter(reference => reference.id !== id)
  }

  function save(note: string): Annotation | null {
    const normalizedNote = note.trim()
    if (!normalizedNote || targets.value.length === 0)
      return null

    const annotation: Annotation = {
      id: crypto.randomUUID(),
      note: normalizedNote,
      targets: targets.value,
      context: context.value,
      createdAt: new Date().toISOString(),
    }
    annotations.value = [...annotations.value, annotation]
    resetDraft()
    return annotation
  }

  function resetDraft(): void {
    targets.value = []
    context.value = []
    open.value = false
  }

  function reset(): void {
    annotations.value = []
    resetDraft()
  }

  return {
    annotations: shallowReadonly(annotations),
    targets: shallowReadonly(targets),
    context: shallowReadonly(context),
    anchor: shallowReadonly(anchor),
    open: shallowReadonly(open),
    targetIds,
    begin,
    close,
    addContext,
    removeContext,
    save,
    reset,
  }
}

function deduplicate(references: ContextReference[]): ContextReference[] {
  return [...new Map(references.map(reference => [reference.id, reference])).values()]
}
