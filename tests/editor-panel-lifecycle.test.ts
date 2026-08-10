import { describe, expect, it, vi } from 'vitest'

import { createPanelRemovalGuard } from '../apps/bev/src/renderer/features/editor/panelRemovalGuard.js'

describe('editor panel removal lifecycle', () => {
  it('does not close a newly reopened file when the old panel was removed during reconciliation', () => {
    const guard = createPanelRemovalGuard<{ id: string }>()
    const oldPanel = { id: 'outline:mod_test.rs' }
    const remove = vi.fn()

    guard.removeFromLayout(oldPanel, remove)

    expect(remove).toHaveBeenCalledWith(oldPanel)
    expect(guard.shouldCloseFile({ id: oldPanel.id })).toBe(false)
  })

  it('closes a file when the user removes its panel', () => {
    const guard = createPanelRemovalGuard<{ id: string }>()

    expect(guard.shouldCloseFile({ id: 'outline:mod_test.rs' })).toBe(true)
  })
})
