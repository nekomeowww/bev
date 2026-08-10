import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { DocumentManager } from '../src/lsp/documents.js'
import { LspClient } from '../src/lsp/client.js'
import { LspSession } from '../src/lsp/session.js'

const fakeServerPath = fileURLToPath(
  new URL('./fixtures/fake-lsp-server.mjs', import.meta.url),
)

describe('LspClient', () => {
  it('provides typed symbol navigation requests', async () => {
    const session = new LspSession({
      workspaceRoot: process.cwd(),
      server: { command: process.execPath, args: [fakeServerPath] },
    })

    try {
      await session.start()
      const document = await new DocumentManager(session).open({
        path: 'virtual.rs',
        languageId: 'rust',
        text: 'fn main() {}',
      })
      const client = new LspClient(session)
      const position = { line: 0, character: 3 }

      await expect(client.definition(document, position)).resolves.toEqual(
        expect.objectContaining({ uri: document.uri }),
      )
      await expect(client.declaration(document, position)).resolves.toEqual(
        expect.objectContaining({ uri: document.uri }),
      )
      await expect(client.typeDefinition(document, position)).resolves.toEqual(
        expect.objectContaining({ uri: document.uri }),
      )
      await expect(client.implementation(document, position)).resolves.toEqual([
        expect.objectContaining({ targetUri: document.uri }),
      ])
      await expect(client.references(document, position)).resolves.toEqual([
        expect.objectContaining({ uri: document.uri }),
      ])
      const hierarchy = await client.prepareCallHierarchy(document, position)
      expect(hierarchy).toHaveLength(1)
      await expect(client.incomingCalls(hierarchy![0]!)).resolves.toEqual([
        expect.objectContaining({ from: expect.objectContaining({ name: 'caller' }) }),
      ])
      await expect(client.outgoingCalls(hierarchy![0]!)).resolves.toEqual([
        expect.objectContaining({ to: expect.objectContaining({ name: 'callee' }) }),
      ])
      const typeHierarchy = await client.prepareTypeHierarchy(document, position)
      expect(typeHierarchy).toHaveLength(1)
      await expect(client.supertypes(typeHierarchy![0]!)).resolves.toEqual([
        expect.objectContaining({ name: 'Entity' }),
      ])
      await expect(client.subtypes(typeHierarchy![0]!)).resolves.toEqual([
        expect.objectContaining({ name: 'Admin' }),
      ])
    }
    finally {
      await session.shutdown()
    }
  })
})
