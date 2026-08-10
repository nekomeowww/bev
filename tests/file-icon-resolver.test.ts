import type { FileIconThemeDocument } from '../apps/bev/src/shared/file-icons.js'

import { describe, expect, it } from 'vitest'

import { resolveFileIcon } from '../apps/bev/src/renderer/features/file-icons/resolver.js'

const document: FileIconThemeDocument = {
  file: 'file',
  folder: 'folder',
  folderExpanded: 'folder-open',
  fileNames: {
    'package.json': 'package',
    'config/package.json': 'config-package',
  },
  fileExtensions: {
    ts: 'typescript',
    'd.ts': 'typescript-definition',
    'generated/d.ts': 'generated-definition',
  },
  languageIds: { vue: 'vue' },
  folderNames: { src: 'src-folder' },
  folderNamesExpanded: { src: 'src-folder-open' },
  light: {
    fileExtensions: { ts: 'typescript-light' },
  },
  iconDefinitions: Object.fromEntries([
    'file',
    'folder',
    'folder-open',
    'package',
    'config-package',
    'typescript',
    'typescript-light',
    'typescript-definition',
    'generated-definition',
    'vue',
    'src-folder',
    'src-folder-open',
  ].map(id => [id, { url: `file-icon:${id}` }])),
  hidesExplorerArrows: false,
  usesCurrentColor: false,
}

describe('file icon theme resolver', () => {
  it('uses VS Code filename and parent-qualified precedence', () => {
    expect(iconFor('package.json')).toBe('file-icon:package')
    expect(iconFor('config/package.json')).toBe('file-icon:config-package')
  })

  it('prefers parent-qualified and longest compound extensions', () => {
    expect(iconFor('types/lib.d.ts')).toBe('file-icon:typescript-definition')
    expect(iconFor('generated/lib.d.ts')).toBe('file-icon:generated-definition')
  })

  it('merges light associations without dropping base mappings', () => {
    expect(iconFor('src/index.ts', 'light')).toBe('file-icon:typescript-light')
    expect(iconFor('src/component.vue', 'light', 'vue')).toBe('file-icon:vue')
  })

  it('resolves named expanded folders before generic folder icons', () => {
    expect(resolveFileIcon(document, {
      path: 'src',
      kind: 'directory',
      expanded: true,
    }, 'dark')?.url).toBe('file-icon:src-folder-open')
  })
})

function iconFor(
  path: string,
  variant: 'dark' | 'light' | 'highContrast' = 'dark',
  languageId?: string,
): string | undefined {
  return resolveFileIcon(document, {
    path,
    kind: 'file',
    ...(languageId ? { languageId } : {}),
  }, variant)?.url
}
