export interface PanelRemovalGuard<T extends { id: string }> {
  removeFromLayout: (panel: T, remove: (panel: T) => void) => void
  shouldCloseFile: (panel: T) => boolean
}

export function createPanelRemovalGuard<T extends { id: string }>(): PanelRemovalGuard<T> {
  const layoutRemovals = new Map<string, number>()

  return {
    removeFromLayout(panel, remove) {
      const pendingRemovals = layoutRemovals.get(panel.id)
      layoutRemovals.set(panel.id, pendingRemovals === undefined ? 1 : pendingRemovals + 1)
      remove(panel)
    },
    shouldCloseFile(panel) {
      const pendingRemovals = layoutRemovals.get(panel.id)
      if (pendingRemovals !== undefined) {
        if (pendingRemovals === 1)
          layoutRemovals.delete(panel.id)
        else
          layoutRemovals.set(panel.id, pendingRemovals - 1)
        return false
      }
      return true
    },
  }
}
