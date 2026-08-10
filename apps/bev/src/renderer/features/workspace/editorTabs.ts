export interface EditorTabsState {
  openPaths: string[]
  previewPath: string | null
}

export interface OpenPreviewResult extends EditorTabsState {
  evictedPath: string | null
}

export function openPreviewTab(state: EditorTabsState, path: string): OpenPreviewResult {
  if (state.openPaths.includes(path)) {
    return {
      ...state,
      evictedPath: null,
    }
  }

  const previewIndex = state.previewPath === null
    ? -1
    : state.openPaths.indexOf(state.previewPath)
  if (previewIndex < 0) {
    return {
      openPaths: [...state.openPaths, path],
      previewPath: path,
      evictedPath: null,
    }
  }

  const openPaths = [...state.openPaths]
  const evictedPath = openPaths[previewIndex]
  openPaths.splice(previewIndex, 1, path)
  return {
    openPaths,
    previewPath: path,
    evictedPath: evictedPath === undefined ? null : evictedPath,
  }
}

export function restorePinnedTab(state: EditorTabsState, path: string): EditorTabsState {
  return state.openPaths.includes(path)
    ? state
    : { ...state, openPaths: [...state.openPaths, path] }
}

export function pinTab(state: EditorTabsState, path: string): EditorTabsState {
  return state.previewPath === path
    ? { ...state, previewPath: null }
    : state
}

export function closeTab(state: EditorTabsState, path: string): EditorTabsState {
  return {
    openPaths: state.openPaths.filter(candidate => candidate !== path),
    previewPath: state.previewPath === path ? null : state.previewPath,
  }
}
