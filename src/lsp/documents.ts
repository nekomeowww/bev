import type {
  DidChangeTextDocumentParams,
  DidCloseTextDocumentParams,
  DidOpenTextDocumentParams,
  DidSaveTextDocumentParams,
  TextDocumentSyncOptions,
} from 'vscode-languageserver-protocol'
import { readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  DidChangeTextDocumentNotification,
  DidCloseTextDocumentNotification,
  DidOpenTextDocumentNotification,
  DidSaveTextDocumentNotification,
  TextDocumentSyncKind,
} from 'vscode-languageserver-protocol'
import type { LspSession } from './session.js'

export interface OpenDocumentInput {
  path: string
  languageId: string
  text?: string
}

export interface DocumentHandle {
  readonly uri: string
  readonly languageId: string
  readonly version: number
}

interface ManagedDocument extends DocumentHandle {
  readonly text: string
}

/**
 * Owns open-document text and version invariants for one LSP session.
 */
export class DocumentManager {
  readonly #session: LspSession
  readonly #workspaceRoot: string
  readonly #documents = new Map<string, ManagedDocument>()
  readonly #opening = new Set<string>()
  readonly #lastVersions = new Map<string, number>()

  constructor(session: LspSession) {
    this.#session = session
    this.#workspaceRoot = session.workspaceRoot
  }

  async open(input: OpenDocumentInput): Promise<DocumentHandle> {
    const absolutePath = isAbsolute(input.path)
      ? input.path
      : resolve(this.#workspaceRoot, input.path)
    const uri = pathToFileURL(absolutePath).href

    if (this.#documents.has(uri))
      throw new Error(`Document is already open: ${uri}`)
    if (this.#opening.has(uri))
      throw new Error(`Document is already opening: ${uri}`)

    this.#opening.add(uri)
    try {
      const lastVersion = this.#lastVersions.get(uri)
      const text = input.text === undefined
        ? await readFile(absolutePath, 'utf8')
        : input.text
      const document: ManagedDocument = {
        uri,
        languageId: input.languageId,
        version: (lastVersion === undefined ? 0 : lastVersion) + 1,
        text,
      }
      if (this.#syncOptions().openClose !== false) {
        const params: DidOpenTextDocumentParams = {
          textDocument: document,
        }
        await this.#session.notify(DidOpenTextDocumentNotification.type, params)
      }

      this.#documents.set(uri, document)
      this.#lastVersions.set(uri, document.version)

      return this.#handle(document)
    }
    finally {
      this.#opening.delete(uri)
    }
  }

  async replace(uri: string, text: string): Promise<DocumentHandle> {
    const current = this.#requireOpen(uri)
    const syncOptions = this.#syncOptions()
    if (syncOptions.change === TextDocumentSyncKind.None)
      throw new Error('The language server does not support document changes')

    const document: ManagedDocument = {
      ...current,
      version: current.version + 1,
      text,
    }
    const params: DidChangeTextDocumentParams = {
      textDocument: { uri, version: document.version },
      contentChanges: [{ text }],
    }
    await this.#session.notify(DidChangeTextDocumentNotification.type, params)
    this.#documents.set(uri, document)
    this.#lastVersions.set(uri, document.version)
    return this.#handle(document)
  }

  async save(uri: string): Promise<void> {
    const document = this.#requireOpen(uri)
    const save = this.#syncOptions().save
    if (!save)
      return

    const params: DidSaveTextDocumentParams = {
      textDocument: { uri },
      ...(typeof save === 'object' && save.includeText ? { text: document.text } : {}),
    }
    await this.#session.notify(DidSaveTextDocumentNotification.type, params)
  }

  async close(uri: string): Promise<void> {
    this.#requireOpen(uri)
    if (this.#syncOptions().openClose !== false) {
      const params: DidCloseTextDocumentParams = {
        textDocument: { uri },
      }
      await this.#session.notify(DidCloseTextDocumentNotification.type, params)
    }

    this.#documents.delete(uri)
  }

  #requireOpen(uri: string): ManagedDocument {
    const document = this.#documents.get(uri)
    if (!document)
      throw new Error(`Document is not open: ${uri}`)
    return document
  }

  #syncOptions(): TextDocumentSyncOptions {
    const sync = this.#session.capabilities?.textDocumentSync
    if (typeof sync === 'number')
      return { openClose: true, change: sync }
    if (!sync)
      return { openClose: false, change: TextDocumentSyncKind.None }

    return {
      ...sync,
      openClose: sync.openClose === undefined ? false : sync.openClose,
      change: sync.change === undefined ? TextDocumentSyncKind.None : sync.change,
    }
  }

  #handle(document: ManagedDocument): DocumentHandle {
    return {
      uri: document.uri,
      languageId: document.languageId,
      version: document.version,
    }
  }
}
