import { resolve } from 'node:path'

import Vue from '@vitejs/plugin-vue'
import { defineConfig } from 'electron-vite'
import UnoCSS from 'unocss/vite'
import VueDevTools from 'vite-plugin-vue-devtools'

const source = (path: string) => resolve(import.meta.dirname, 'src', path)

export default defineConfig({
  main: {
    build: {
      externalizeDeps: true,
    },
  },
  preload: {
    build: {
      lib: {
        entry: {
          index: source('preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    base: './',
    plugins: [
      UnoCSS({ configFile: resolve(import.meta.dirname, 'uno.config.ts') }),
      VueDevTools(),
      Vue(),
    ],
    build: {
      rollupOptions: {
        input: {
          main: source('renderer/index.html'),
        },
      },
    },
  },
})
