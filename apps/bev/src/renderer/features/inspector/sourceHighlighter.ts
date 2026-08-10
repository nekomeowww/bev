import type { HighlighterCore, ThemedToken } from 'shiki'

import c from 'shiki/langs/c.mjs'
import cpp from 'shiki/langs/cpp.mjs'
import css from 'shiki/langs/css.mjs'
import go from 'shiki/langs/go.mjs'
import html from 'shiki/langs/html.mjs'
import java from 'shiki/langs/java.mjs'
import javascript from 'shiki/langs/javascript.mjs'
import jsx from 'shiki/langs/jsx.mjs'
import json from 'shiki/langs/json.mjs'
import kotlin from 'shiki/langs/kotlin.mjs'
import markdown from 'shiki/langs/markdown.mjs'
import python from 'shiki/langs/python.mjs'
import rust from 'shiki/langs/rust.mjs'
import scss from 'shiki/langs/scss.mjs'
import swift from 'shiki/langs/swift.mjs'
import tsx from 'shiki/langs/tsx.mjs'
import typescript from 'shiki/langs/typescript.mjs'
import vue from 'shiki/langs/vue.mjs'
import yaml from 'shiki/langs/yaml.mjs'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import githubDark from 'shiki/themes/github-dark.mjs'
import githubLight from 'shiki/themes/github-light.mjs'

const languages = [
  ...c,
  ...cpp,
  ...css,
  ...go,
  ...html,
  ...java,
  ...javascript,
  ...jsx,
  ...json,
  ...kotlin,
  ...markdown,
  ...python,
  ...rust,
  ...scss,
  ...swift,
  ...tsx,
  ...typescript,
  ...vue,
  ...yaml,
]

let highlighterPromise: Promise<HighlighterCore> | undefined

export async function highlightSource(
  code: string,
  languageId: string,
  colorScheme: 'light' | 'dark',
): Promise<ThemedToken[][]> {
  if (languageId === 'plaintext')
    return code.split('\n').map(line => [{ content: line, offset: 0 }])

  const highlighter = await getHighlighter()
  const result = highlighter.codeToTokens(code, {
    lang: normalizeLanguageId(languageId),
    theme: colorScheme === 'dark' ? 'github-dark' : 'github-light',
  })
  return result.tokens
}

function getHighlighter(): Promise<HighlighterCore> {
  if (highlighterPromise === undefined) {
    highlighterPromise = createHighlighterCore({
      engine: createJavaScriptRegexEngine(),
      langs: languages,
      themes: [githubDark, githubLight],
    })
  }
  return highlighterPromise
}

function normalizeLanguageId(languageId: string): string {
  switch (languageId) {
    case 'javascriptreact':
      return 'jsx'
    case 'typescriptreact':
      return 'tsx'
    default:
      return languageId
  }
}
