# Domain glossary

## LSP Host

The module that owns language-server processes and protocol sessions on behalf of callers. A caller does not need to understand process transport, JSON-RPC framing, request identifiers, server-initiated requests, or shutdown ordering.

## LSP Session

A stateful conversation between one LSP Host and one language-server process for one workspace root. It begins with initialization and ends with the LSP shutdown sequence.

## Language Adapter

The language-specific configuration used by the LSP Host to start and initialize a language server. It supplies executable details and server settings without changing the LSP Session interface.

## Workspace Root

The single directory represented by the first prototype's LSP Session. It is advertised through the LSP `workspaceFolders` mechanism even though the prototype does not yet support adding or removing roots.

## Open Document

A source document whose current text and monotonically increasing version are synchronized with a language server for the duration of an LSP Session.
