import type { Component } from 'vue'

import GenericOutlineRenderer from './GenericOutlineRenderer.vue'
import RustOutlineRenderer from './RustOutlineRenderer.vue'
import WebOutlineRenderer from './WebOutlineRenderer.vue'

const languageRenderers: Record<string, Component> = {
  javascript: WebOutlineRenderer,
  javascriptreact: WebOutlineRenderer,
  rust: RustOutlineRenderer,
  typescript: WebOutlineRenderer,
  typescriptreact: WebOutlineRenderer,
  vue: WebOutlineRenderer,
}

export function rendererForLanguage(languageId: string): Component {
  const renderer = languageRenderers[languageId]
  return renderer === undefined ? GenericOutlineRenderer : renderer
}
