import { describe, expect, it } from 'vitest'

import {
  closeTab,
  openPreviewTab,
  pinTab,
  restorePinnedTab,
} from '../apps/bev/src/renderer/features/workspace/editorTabs'

describe('editor tabs', () => {
  it('reuses one preview slot until the tab is pinned', () => {
    const first = openPreviewTab({ openPaths: [], previewPath: null }, 'src/first.ts')
    expect(first).toEqual({
      openPaths: ['src/first.ts'],
      previewPath: 'src/first.ts',
      evictedPath: null,
    })

    const second = openPreviewTab(first, 'src/second.ts')
    expect(second).toEqual({
      openPaths: ['src/second.ts'],
      previewPath: 'src/second.ts',
      evictedPath: 'src/first.ts',
    })

    const pinned = pinTab(second, 'src/second.ts')
    expect(pinned.previewPath).toBeNull()

    const third = openPreviewTab(pinned, 'src/third.ts')
    expect(third.openPaths).toEqual(['src/second.ts', 'src/third.ts'])
    expect(third.evictedPath).toBeNull()
  })

  it('keeps restored tabs pinned and clears a closed preview', () => {
    const restored = restorePinnedTab({ openPaths: [], previewPath: null }, 'src/restored.ts')
    expect(restored).toEqual({ openPaths: ['src/restored.ts'], previewPath: null })

    const preview = openPreviewTab(restored, 'src/preview.ts')
    expect(closeTab(preview, 'src/preview.ts')).toEqual({
      openPaths: ['src/restored.ts'],
      previewPath: null,
    })
  })
})
