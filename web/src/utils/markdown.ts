import { t } from '../i18n'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import DOMPurify from 'dompurify'
import type { MessageFile } from '../types/chat'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('c', c)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('css', css)
hljs.registerLanguage('go', go)
hljs.registerLanguage('java', java)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('python', python)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('yaml', yaml)
hljs.registerAliases(['html', 'vue'], { languageName: 'xml' })

export type MarkdownImageAsset = Partial<MessageFile> & {
  name: string
  kind: 'image'
  url?: string
  alt?: string
  title?: string
}

const markdownImagePattern = /!\[(.*?)\]\((\S+?)(?:\s+"(.*?)")?\)/g

const markdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: true,
  highlight: function (str: string, lang: string): string {
    const langValid = lang && hljs.getLanguage(lang)
    const langLabel = langValid ? `<span class="code-lang-label">${lang}</span>` : ''
    const highlighted = langValid
      ? hljs.highlight(str, { language: lang, ignoreIllegals: true }).value
      : markdownIt.utils.escapeHtml(str)
    return `<pre class="code-block"><div class="code-block-header">${langLabel}<button class="code-block-copy" type="button">${t('ui.copy')}</button></div><code${lang ? ` class="hljs language-${lang}"` : ' class="hljs"'}>${highlighted}</code></pre>`
  }
})

const defaultLinkOpenRenderer =
  markdownIt.renderer.rules.link_open ??
  ((tokens: any[], idx: number, options: any, env: any, self: any) =>
    self.renderToken(tokens, idx, options))

markdownIt.renderer.rules.link_open = (
  tokens: any[],
  idx: number,
  options: any,
  env: any,
  self: any
) => {
  const token = tokens[idx]

  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noopener noreferrer')

  return defaultLinkOpenRenderer(tokens, idx, options, env, self)
}

export function renderMarkdown(content: string) {
  const html = markdownIt.render(content ?? '')
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}

function renderRawHtml(content: string) {
  return markdownIt.render(content ?? '')
}

function parseRenderedHtml(html: string) {
  const parser = new DOMParser()
  return parser.parseFromString(html, 'text/html')
}

export function extractMarkdownImages(content: string): MarkdownImageAsset[] {
  const html = renderRawHtml(content)
  const document = parseRenderedHtml(html)
  const images: MarkdownImageAsset[] = []

  for (const imageElement of document.querySelectorAll('img')) {
    const url = imageElement.getAttribute('src') || ''

    if (!url) continue

    images.push({
      kind: 'image',
      alt: imageElement.getAttribute('alt') || '',
      url,
      name: imageElement.getAttribute('alt') || imageElement.getAttribute('title') || 'image',
      title: imageElement.getAttribute('title') || undefined
    })
  }

  return images
}

export function markdownToPlainText(md: string): string {
  const tokens = markdownIt.parse(md ?? '', {})
  const parts: string[] = []

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]

    if (t.type === 'inline') {
      parts.push(extractInlineText(t))
    } else if (t.type === 'fence' || t.type === 'code_block') {
      parts.push(t.content)
      parts.push('\n')
    } else if (t.nesting === -1) {
      if (t.type === 'tr_close') {
        parts.push('\n')
      } else if (t.type === 'th_close' || t.type === 'td_close') {
        parts.push('  ')
      } else if (
        [
          'paragraph_close',
          'heading_close',
          'blockquote_close',
          'list_item_close',
          'bullet_list_close',
          'ordered_list_close'
        ].includes(t.type)
      ) {
        parts.push('\n\n')
      }
    }
  }

  return parts
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractInlineText(token: any): string {
  if (!token.children || token.children.length === 0) {
    return token.content ?? ''
  }

  const parts: string[] = []
  for (const child of token.children) {
    if (child.type === 'text' || child.type === 'code_inline') {
      parts.push(child.content ?? '')
    } else if (child.type === 'image') {
      parts.push(child.alt ?? '')
    } else if (child.type === 'softbreak' || child.type === 'hardbreak') {
      parts.push('\n')
    }
  }

  return parts.join('')
}

export function renderMarkdownWithoutFileLinks(content: string, fileList: MessageFile[] = []) {
  const document = parseRenderedHtml(renderRawHtml(content))
  const storageKeySet = new Set(fileList.map((file) => file.storageKey))

  for (const imageElement of document.querySelectorAll('img')) {
    imageElement.remove()
  }

  for (const anchorElement of document.querySelectorAll('a')) {
    const href = anchorElement.getAttribute('href') || ''
    const storageKey = getStorageKeyFromFileUrl(href)

    if (!storageKey || !storageKeySet.has(storageKey)) {
      continue
    }

    const parentElement = anchorElement.parentElement
    anchorElement.remove()

    if (parentElement && parentElement.tagName === 'P') {
      const text = parentElement.textContent?.replace(/[👉📥\s]+/g, '').trim() || ''

      if (!text) {
        parentElement.remove()
      }
    }
  }

  for (const paragraphElement of document.querySelectorAll('p')) {
    const text = paragraphElement.textContent?.trim() || ''
    const hasMeaningfulChildren = Array.from(paragraphElement.children).some(
      (child) => child.tagName !== 'BR'
    )

    if (!text && !hasMeaningfulChildren) {
      paragraphElement.remove()
    }
  }

  return DOMPurify.sanitize(document.body.innerHTML, { USE_PROFILES: { html: true } })
}

function getStorageKeyFromFileUrl(url: string) {
  try {
    const parsedUrl = new URL(url, window.location.origin)
    if (parsedUrl.pathname !== '/api/files/url') {
      return ''
    }

    return parsedUrl.searchParams.get('key') || ''
  } catch {
    return ''
  }
}
