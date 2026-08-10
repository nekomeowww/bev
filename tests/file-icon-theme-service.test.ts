import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { FileIconThemeService, parseExtensionCoordinate } from '../apps/bev/src/main/services/file-icon-theme.js'

describe('Open VSX extension coordinates', () => {
  it('accepts dotted and slash-separated extension IDs', () => {
    expect(parseExtensionCoordinate('PKief.material-icon-theme')).toEqual({
      namespace: 'PKief',
      name: 'material-icon-theme',
    })
    expect(parseExtensionCoordinate('vscode-icons-team/vscode-icons')).toEqual({
      namespace: 'vscode-icons-team',
      name: 'vscode-icons',
    })
  })

  it('rejects URLs and path traversal', () => {
    expect(() => parseExtensionCoordinate('https://open-vsx.org')).toThrow()
    expect(() => parseExtensionCoordinate('../material-icons')).toThrow()
  })
})

describe('Open VSX file icon theme catalog', () => {
  it('keeps only extensions that contribute file icon themes', async () => {
    const service = new FileIconThemeService({
      cacheRoot: '/tmp/bev-file-icon-theme-catalog-test',
      fetch: async (input) => {
        const url = String(input)
        if (url.includes('/api/-/search?')) {
          return jsonResponse({
            extensions: [
              extensionSearchResult('icons', 'Icons'),
              extensionSearchResult('colors', 'Colors'),
            ],
          })
        }
        if (url.includes('/icons/')) {
          return jsonResponse({
            contributes: {
              iconThemes: [
                { id: 'dark-icons', label: 'Dark Icons', path: './icons.json' },
                { id: 'light-icons', label: 'Light Icons', path: './icons-light.json' },
              ],
            },
          })
        }
        return jsonResponse({ contributes: { themes: [{ path: './colors.json' }] } })
      },
    })

    await expect(service.search()).resolves.toMatchObject([
      { extensionId: 'publisher.icons', themeId: 'dark-icons', themeLabel: 'Dark Icons' },
      { extensionId: 'publisher.icons', themeId: 'light-icons', themeLabel: 'Light Icons' },
    ])
  })
})

describe('Open VSX file icon theme installation', () => {
  it('maps generated SVG assets without serializing them into IPC data', async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), 'bev-file-icon-theme-install-'))
    const extensionRoot = join(cacheRoot, 'publisher.icons', '1.0.0', 'extension')
    const themeRoot = join(extensionRoot, 'themes')
    await mkdir(themeRoot, { recursive: true })
    await writeFile(join(extensionRoot, 'package.json'), JSON.stringify({
      contributes: {
        iconThemes: [{ id: 'large-icons', label: 'Large Icons', path: './themes/icons.json' }],
      },
    }))
    await writeFile(join(themeRoot, 'icons.json'), JSON.stringify({
      file: 'large-file',
      iconDefinitions: {
        'large-file': { iconPath: './large.svg' },
      },
    }))
    await writeFile(join(themeRoot, 'large.svg'), `<svg><!--${'x'.repeat(600 * 1024)}--></svg>`)

    try {
      const service = new FileIconThemeService({
        cacheRoot,
        fetch: async () => jsonResponse({
          namespace: 'publisher',
          name: 'icons',
          version: '1.0.0',
          files: { download: 'https://open-vsx.org/example.vsix' },
        }),
      })

      await expect(service.installExtension('publisher.icons', '1.0.0')).resolves.toEqual({
        extensionId: 'publisher.icons',
        version: '1.0.0',
      })
      await expect(service.current()).resolves.toBeNull()

      const installed = await service.selectTheme('publisher.icons', '1.0.0', 'large-icons')
      const resourceUrl = installed.document.iconDefinitions['large-file']?.url
      expect(resourceUrl).toMatch(/^bev-file-icon:\/\/asset\//)
      expect(service.resourcePath(resourceUrl!)).toBe(join(themeRoot, 'large.svg'))
      expect(service.resourcePath('bev-file-icon://asset/not-registered')).toBeUndefined()

      await service.uninstallExtension('publisher.icons', '1.0.0')
      await expect(service.current()).resolves.toBeNull()
      expect(service.resourcePath(resourceUrl!)).toBeUndefined()
      await expect(readFile(join(extensionRoot, 'package.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    }
    finally {
      await rm(cacheRoot, { recursive: true, force: true })
    }
  })
})

function extensionSearchResult(name: string, displayName: string) {
  return {
    namespace: 'publisher',
    name,
    version: '1.0.0',
    displayName,
    description: `${displayName} extension`,
    files: {},
  }
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
