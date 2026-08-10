import type {
  FileIconAssociations,
  FileIconColorVariant,
  FileIconThemeDocument,
  ResolveFileIconInput,
  ResolvedFileIcon,
} from '../../../shared/file-icons'

export function resolveFileIcon(
  document: FileIconThemeDocument,
  input: ResolveFileIconInput,
  variant: FileIconColorVariant,
): ResolvedFileIcon | null {
  const associations = mergeAssociations(
    document,
    variant === 'light'
      ? document.light
      : variant === 'highContrast'
        ? document.highContrast
        : undefined,
  )
  const definitionId = input.kind === 'directory'
    ? resolveFolderDefinition(associations, input)
    : resolveFileDefinition(associations, input)
  if (!definitionId)
    return null
  const definition = document.iconDefinitions[definitionId]
  return definition
    ? { url: definition.url, usesCurrentColor: document.usesCurrentColor }
    : null
}

function resolveFileDefinition(
  associations: FileIconAssociations,
  input: ResolveFileIconInput,
): string | undefined {
  const { basename, parent } = resourceParts(input.path)
  const fileNames = associations.fileNames
  if (fileNames) {
    const qualified = parent ? fileNames[`${parent}/${basename}`] : undefined
    if (qualified)
      return qualified
    const ordinary = fileNames[basename]
    if (ordinary)
      return ordinary
  }

  const extensions = extensionCandidates(basename)
  const fileExtensions = associations.fileExtensions
  if (fileExtensions) {
    if (parent) {
      for (const extension of extensions) {
        const qualified = fileExtensions[`${parent}/${extension}`]
        if (qualified)
          return qualified
      }
    }
    for (const extension of extensions) {
      const ordinary = fileExtensions[extension]
      if (ordinary)
        return ordinary
    }
  }

  const languageId = input.languageId?.toLowerCase()
  return (languageId ? associations.languageIds?.[languageId] : undefined) ?? associations.file
}

function resolveFolderDefinition(
  associations: FileIconAssociations,
  input: ResolveFileIconInput,
): string | undefined {
  const { basename, parent } = resourceParts(input.path)
  if (input.root) {
    if (input.expanded) {
      const expanded = associations.rootFolderNamesExpanded?.[basename]
      if (expanded)
        return expanded
    }
    const named = associations.rootFolderNames?.[basename]
    if (named)
      return named
    return input.expanded
      ? associations.rootFolderExpanded
        ?? associations.rootFolder
        ?? associations.folderExpanded
        ?? associations.folder
      : associations.rootFolder ?? associations.folder
  }

  if (input.expanded) {
    const expanded = resolveNamedFolder(associations.folderNamesExpanded, basename, parent)
    if (expanded)
      return expanded
  }
  const named = resolveNamedFolder(associations.folderNames, basename, parent)
  if (named)
    return named
  return input.expanded
    ? associations.folderExpanded ?? associations.folder
    : associations.folder
}

function resolveNamedFolder(
  associations: Record<string, string> | undefined,
  basename: string,
  parent: string,
): string | undefined {
  if (!associations)
    return undefined
  return (parent ? associations[`${parent}/${basename}`] : undefined) ?? associations[basename]
}

function mergeAssociations(
  base: FileIconAssociations,
  override: FileIconAssociations | undefined,
): FileIconAssociations {
  if (!override)
    return base
  return {
    ...base,
    ...override,
    fileNames: mergeMap(base.fileNames, override.fileNames),
    fileExtensions: mergeMap(base.fileExtensions, override.fileExtensions),
    languageIds: mergeMap(base.languageIds, override.languageIds),
    folderNames: mergeMap(base.folderNames, override.folderNames),
    folderNamesExpanded: mergeMap(base.folderNamesExpanded, override.folderNamesExpanded),
    rootFolderNames: mergeMap(base.rootFolderNames, override.rootFolderNames),
    rootFolderNamesExpanded: mergeMap(base.rootFolderNamesExpanded, override.rootFolderNamesExpanded),
  }
}

function mergeMap(
  base: Record<string, string> | undefined,
  override: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!base)
    return override
  if (!override)
    return base
  return { ...base, ...override }
}

function resourceParts(path: string): { basename: string, parent: string } {
  const parts = path.replaceAll('\\', '/').toLowerCase().split('/').filter(Boolean)
  return {
    basename: parts.at(-1) ?? '',
    parent: parts.at(-2) ?? '',
  }
}

function extensionCandidates(basename: string): string[] {
  const segments = basename.split('.')
  const result: string[] = []
  for (let index = 1; index < segments.length; index++) {
    const extension = segments.slice(index).join('.')
    if (extension)
      result.push(extension)
  }
  return result
}
