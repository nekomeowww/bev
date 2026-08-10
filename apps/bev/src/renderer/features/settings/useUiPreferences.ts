import { shallowReadonly, shallowRef, watch } from 'vue'

const defaultFontSize = 13
const minimumFontSize = 11
const maximumFontSize = 16
const fontSizeStorageKey = 'bev:ui-font-size:v1'

export function useUiPreferences() {
  const fontSize = shallowRef(readFontSize())

  function setFontSize(value: number): void {
    fontSize.value = clampFontSize(value)
  }

  watch(
    fontSize,
    (value) => {
      document.documentElement.style.setProperty('--ui-font-size', `${value}px`)
      localStorage.setItem(fontSizeStorageKey, String(value))
    },
    { immediate: true },
  )

  return {
    fontSize: shallowReadonly(fontSize),
    setFontSize,
  }
}

function readFontSize(): number {
  const stored = localStorage.getItem(fontSizeStorageKey)
  if (stored === null)
    return defaultFontSize
  const value = Number(stored)
  return Number.isFinite(value) ? clampFontSize(value) : defaultFontSize
}

function clampFontSize(value: number): number {
  return Math.min(maximumFontSize, Math.max(minimumFontSize, Math.round(value)))
}
