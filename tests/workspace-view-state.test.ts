import { describe, expect, it } from 'vitest'

import { outlineStatusMessage } from '../apps/bev/src/renderer/features/workspace/state.js'

describe('outlineStatusMessage', () => {
  it('distinguishes no selection, loading, empty results, and failures', () => {
    expect(outlineStatusMessage({ status: 'unselected' })).toBe('Select a source file')
    expect(outlineStatusMessage({ status: 'loading', path: 'src/lib.rs' })).toBe('Loading outline')
    expect(outlineStatusMessage({
      status: 'ready',
      path: 'src/lib.rs',
      outline: {
        path: 'src/lib.rs',
        languageId: 'rust',
        symbols: [],
        diagnostics: { status: 'ready', items: [] },
        provider: 'rust-analyzer',
        capabilities: [],
        analysisStatus: 'ready',
      },
    })).toBe('No symbols found')
    expect(outlineStatusMessage({
      status: 'error',
      path: 'src/lib.rs',
      message: 'rust-analyzer exited',
    })).toBe('rust-analyzer exited')
  })
})
