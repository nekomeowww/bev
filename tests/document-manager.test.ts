import type { MarkupContent } from 'vscode-languageserver-protocol'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DocumentManager } from '../src/lsp/documents.js'
import { LspClient } from '../src/lsp/client.js'
import { LspSession } from '../src/lsp/session.js'

const fakeServerPath = fileURLToPath(
  new URL('./fixtures/fake-lsp-server.mjs', import.meta.url),
)

describe('DocumentManager', () => {
  it('rejects a concurrent second open before sending duplicate didOpen notifications', async () => {
    const session = new LspSession({
      workspaceRoot: process.cwd(),
      server: {
        command: process.execPath,
        args: [fakeServerPath],
      },
    })

    await session.start()
    const documents = new DocumentManager(session)

    try {
      const firstOpen = documents.open({
        path: 'src/concurrent.rs',
        languageId: 'rust',
        text: 'fn concurrent() {}',
      })
      const secondOpen = documents.open({
        path: 'src/concurrent.rs',
        languageId: 'rust',
        text: 'fn concurrent() {}',
      })

      await expect(secondOpen).rejects.toThrow('Document is already opening')
      await expect(firstOpen).resolves.toEqual(expect.objectContaining({
        languageId: 'rust',
        version: 1,
      }))
    }
    finally {
      await session.shutdown()
    }
  })

  it('synchronizes open, replace, save, and close with monotonically increasing versions', async () => {
    const session = new LspSession({
      workspaceRoot: process.cwd(),
      server: {
        command: process.execPath,
        args: [fakeServerPath],
      },
      settings: {},
    })

    await session.start()
    const documents = new DocumentManager(session)
    const client = new LspClient(session)

    try {
      const opened = await documents.open({
        path: 'src/example.rs',
        languageId: 'rust',
        text: 'fn before() {}',
      })
      expect(opened.version).toBe(1)

      const changed = await documents.replace(opened.uri, 'fn after() {}')
      expect(changed.version).toBe(2)

      await documents.save(changed.uri)
      const hover = await client.hover(changed, { line: 0, character: 4 })
      expect(JSON.parse((hover?.contents as MarkupContent).value)).toEqual({
        text: 'fn after() {}',
        version: 2,
        saved: true,
      })

      await documents.close(changed.uri)
      await expect(client.hover(changed, { line: 0, character: 4 })).resolves.toBeNull()
    }
    finally {
      await session.shutdown()
    }
  })
})
