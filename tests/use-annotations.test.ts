import { describe, expect, it } from 'vitest'

import { useAnnotations } from '../apps/bev/src/renderer/features/annotations/useAnnotations.js'

const target = {
  id: 'file:src/lib.rs',
  kind: 'file' as const,
  label: 'lib.rs',
  path: 'src/lib.rs',
}

describe('useAnnotations', () => {
  it('clears draft targets and context when closing or saving', () => {
    const annotations = useAnnotations()

    annotations.begin([target], { x: 10, y: 20 })
    annotations.addContext({ ...target, id: 'file:src/main.rs', path: 'src/main.rs' })
    annotations.close()

    expect(annotations.open.value).toBe(false)
    expect(annotations.targets.value).toEqual([])
    expect(annotations.context.value).toEqual([])
    expect(annotations.targetIds.value.size).toBe(0)

    annotations.begin([target], { x: 10, y: 20 })
    expect(annotations.save('Explain this')).toEqual(expect.objectContaining({
      note: 'Explain this',
      targets: [target],
    }))
    expect(annotations.targets.value).toEqual([])
    expect(annotations.context.value).toEqual([])
    expect(annotations.targetIds.value.size).toBe(0)
  })

  it('resets saved annotations when the workspace changes', () => {
    const annotations = useAnnotations()
    annotations.begin([target], { x: 10, y: 20 })
    annotations.save('Saved')

    annotations.reset()

    expect(annotations.annotations.value).toEqual([])
    expect(annotations.open.value).toBe(false)
  })
})
