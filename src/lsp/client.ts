import type {
  CallHierarchyIncomingCall,
  CallHierarchyItem,
  CallHierarchyOutgoingCall,
  DocumentSymbol,
  Hover,
  Location,
  LocationLink,
  Position,
  SymbolInformation,
  TypeHierarchyItem,
} from 'vscode-languageserver-protocol'
import {
  CallHierarchyIncomingCallsRequest,
  CallHierarchyOutgoingCallsRequest,
  CallHierarchyPrepareRequest,
  DefinitionRequest,
  DeclarationRequest,
  DocumentSymbolRequest,
  HoverRequest,
  ImplementationRequest,
  ReferencesRequest,
  TypeHierarchyPrepareRequest,
  TypeHierarchySubtypesRequest,
  TypeHierarchySupertypesRequest,
  TypeDefinitionRequest,
} from 'vscode-languageserver-protocol'
import type { DocumentHandle } from './documents.js'
import type { LspSession } from './session.js'

/**
 * Provides typed access to the standard LSP features currently used by Bev.
 */
export class LspClient {
  readonly #session: LspSession

  constructor(session: LspSession) {
    this.#session = session
  }

  documentSymbols(
    document: DocumentHandle,
  ): Promise<DocumentSymbol[] | SymbolInformation[] | null> {
    return this.#session.request(DocumentSymbolRequest.type, {
      textDocument: { uri: document.uri },
    })
  }

  hover(document: DocumentHandle, position: Position): Promise<Hover | null> {
    return this.#session.request(HoverRequest.type, {
      textDocument: { uri: document.uri },
      position,
    })
  }

  definition(
    document: DocumentHandle,
    position: Position,
  ): Promise<Location | Location[] | LocationLink[] | null> {
    return this.#session.request(DefinitionRequest.type, {
      textDocument: { uri: document.uri },
      position,
    })
  }

  declaration(
    document: DocumentHandle,
    position: Position,
  ): Promise<Location | Location[] | LocationLink[] | null> {
    return this.#session.request(DeclarationRequest.type, {
      textDocument: { uri: document.uri },
      position,
    })
  }

  typeDefinition(
    document: DocumentHandle,
    position: Position,
  ): Promise<Location | Location[] | LocationLink[] | null> {
    return this.#session.request(TypeDefinitionRequest.type, {
      textDocument: { uri: document.uri },
      position,
    })
  }

  references(document: DocumentHandle, position: Position): Promise<Location[] | null> {
    return this.#session.request(ReferencesRequest.type, {
      textDocument: { uri: document.uri },
      position,
      context: { includeDeclaration: false },
    })
  }

  implementation(
    document: DocumentHandle,
    position: Position,
  ): Promise<Location | Location[] | LocationLink[] | null> {
    return this.#session.request(ImplementationRequest.type, {
      textDocument: { uri: document.uri },
      position,
    })
  }

  prepareCallHierarchy(
    document: DocumentHandle,
    position: Position,
  ): Promise<CallHierarchyItem[] | null> {
    return this.#session.request(CallHierarchyPrepareRequest.type, {
      textDocument: { uri: document.uri },
      position,
    })
  }

  incomingCalls(item: CallHierarchyItem): Promise<CallHierarchyIncomingCall[] | null> {
    return this.#session.request(CallHierarchyIncomingCallsRequest.type, { item })
  }

  outgoingCalls(item: CallHierarchyItem): Promise<CallHierarchyOutgoingCall[] | null> {
    return this.#session.request(CallHierarchyOutgoingCallsRequest.type, { item })
  }

  prepareTypeHierarchy(
    document: DocumentHandle,
    position: Position,
  ): Promise<TypeHierarchyItem[] | null> {
    return this.#session.request(TypeHierarchyPrepareRequest.type, {
      textDocument: { uri: document.uri },
      position,
    })
  }

  supertypes(item: TypeHierarchyItem): Promise<TypeHierarchyItem[] | null> {
    return this.#session.request(TypeHierarchySupertypesRequest.type, { item })
  }

  subtypes(item: TypeHierarchyItem): Promise<TypeHierarchyItem[] | null> {
    return this.#session.request(TypeHierarchySubtypesRequest.type, { item })
  }
}
