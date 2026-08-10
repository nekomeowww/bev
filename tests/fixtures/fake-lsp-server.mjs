import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node'

const connection = createMessageConnection(
  new StreamMessageReader(process.stdin),
  new StreamMessageWriter(process.stdout),
)

let configuration
const openedDocuments = new Map()
const savedDocuments = new Set()
const loadingDocuments = new Set()
const readyDocuments = new Set()

connection.onRequest('initialize', () => {
  if (process.env.BEV_FAKE_INITIALIZE_ERROR === '1')
    throw new Error('fixture initialize failure')

  return {
    capabilities: {
      callHierarchyProvider: true,
      documentSymbolProvider: true,
      definitionProvider: true,
      declarationProvider: true,
      hoverProvider: true,
      implementationProvider: true,
      referencesProvider: true,
      textDocumentSync: {
        openClose: true,
        change: 1,
        save: { includeText: true },
      },
      typeHierarchyProvider: true,
      typeDefinitionProvider: true,
    },
    serverInfo: {
      name: 'bev-fake-lsp',
      version: '0.0.0',
    },
  }
})

connection.onNotification('initialized', () => {
  configuration = connection.sendRequest('workspace/configuration', {
    items: [{ section: 'rust-analyzer' }],
  })
})

connection.onNotification('textDocument/didOpen', ({ textDocument }) => {
  openedDocuments.set(textDocument.uri, textDocument)
  savedDocuments.delete(textDocument.uri)
  connection.sendNotification('textDocument/publishDiagnostics', {
    uri: textDocument.uri,
    version: textDocument.version,
    diagnostics: [{
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 3 },
      },
      severity: 2,
      message: 'fixture diagnostic',
      source: 'bev-fake-lsp',
    }],
  })
})

connection.onNotification('textDocument/didChange', ({ textDocument, contentChanges }) => {
  const openedDocument = openedDocuments.get(textDocument.uri)
  if (!openedDocument)
    throw new Error('cannot change a document that is not open')

  const lastChange = contentChanges.at(-1)
  openedDocuments.set(textDocument.uri, {
    ...openedDocument,
    version: textDocument.version,
    text: lastChange === undefined ? openedDocument.text : lastChange.text,
  })
  savedDocuments.delete(textDocument.uri)
})

connection.onNotification('textDocument/didSave', ({ textDocument }) => {
  if (!openedDocuments.has(textDocument.uri))
    throw new Error('cannot save a document that is not open')

  savedDocuments.add(textDocument.uri)
})

connection.onNotification('textDocument/didClose', ({ textDocument }) => {
  openedDocuments.delete(textDocument.uri)
  savedDocuments.delete(textDocument.uri)
})

connection.onRequest('textDocument/hover', ({ textDocument }) => {
  const openedDocument = openedDocuments.get(textDocument.uri)
  if (!openedDocument)
    return null

  return {
    contents: {
      kind: 'plaintext',
      value: JSON.stringify({
        text: openedDocument.text,
        version: openedDocument.version,
        saved: savedDocuments.has(textDocument.uri),
      }),
    },
  }
})

connection.onRequest('textDocument/documentSymbol', async ({ textDocument }) => {
  const settings = await configuration

  if (!openedDocuments.has(textDocument.uri))
    throw new Error('document was not opened before documentSymbol')

  if (textDocument.uri.endsWith('/loading.rs') && !readyDocuments.has(textDocument.uri)) {
    if (!loadingDocuments.has(textDocument.uri)) {
      loadingDocuments.add(textDocument.uri)
      connection.sendNotification('$/progress', {
        token: 'rustAnalyzer/Roots Scanned',
        value: { kind: 'begin', title: 'Roots Scanned' },
      })
      setTimeout(() => {
        readyDocuments.add(textDocument.uri)
        connection.sendNotification('$/progress', {
          token: 'rustAnalyzer/Roots Scanned',
          value: { kind: 'end', title: 'Roots Scanned' },
        })
      }, 50)
    }
    return null
  }

  return [{
    name: 'main',
    detail: settings[0]?.check?.command,
    kind: 12,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 10 },
    },
    selectionRange: {
      start: { line: 0, character: 3 },
      end: { line: 0, character: 7 },
    },
  }]
})

connection.onRequest('textDocument/definition', ({ textDocument, position }) => ({
  uri: textDocument.uri,
  range: { start: position, end: position },
}))

connection.onRequest('textDocument/declaration', ({ textDocument, position }) => ({
  uri: textDocument.uri,
  range: { start: position, end: position },
}))

connection.onRequest('textDocument/typeDefinition', ({ textDocument, position }) => ({
  uri: textDocument.uri,
  range: { start: position, end: position },
}))

connection.onRequest('textDocument/implementation', ({ textDocument, position }) => [{
  targetUri: textDocument.uri,
  targetRange: { start: position, end: position },
  targetSelectionRange: { start: position, end: position },
}])

connection.onRequest('textDocument/references', ({ textDocument, position }) => [{
  uri: textDocument.uri,
  range: { start: position, end: position },
}])

connection.onRequest('textDocument/prepareCallHierarchy', ({ textDocument, position }) => [{
  name: 'main',
  kind: 12,
  uri: textDocument.uri,
  range: { start: position, end: position },
  selectionRange: { start: position, end: position },
}])

connection.onRequest('callHierarchy/incomingCalls', ({ item }) => [{
  from: { ...item, name: 'caller' },
  fromRanges: [item.selectionRange],
}])

connection.onRequest('callHierarchy/outgoingCalls', ({ item }) => [{
  to: { ...item, name: 'callee' },
  fromRanges: [item.selectionRange],
}])

connection.onRequest('textDocument/prepareTypeHierarchy', ({ textDocument, position }) => [{
  name: 'User',
  kind: 5,
  uri: textDocument.uri,
  range: { start: position, end: position },
  selectionRange: { start: position, end: position },
}])

connection.onRequest('typeHierarchy/supertypes', ({ item }) => [{ ...item, name: 'Entity' }])
connection.onRequest('typeHierarchy/subtypes', ({ item }) => [{ ...item, name: 'Admin' }])

connection.onRequest('shutdown', () => null)
connection.onNotification('exit', () => process.exit(0))

connection.listen()
