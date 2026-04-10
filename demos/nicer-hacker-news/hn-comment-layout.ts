import {
  materializeRichInlineLineRange,
  prepareRichInline,
  walkRichInlineLineRanges,
  type PreparedRichInline,
} from '../../../pretext/src/rich-inline'
import {
  layoutNextLine,
  measureNaturalWidth,
  prepareWithSegments,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from '../../../pretext/src/layout'
import {type HNCommentDoc, type HNRun} from './hn-comment-parser'

export const COMMENT_LINE_HEIGHT = 14
export const COMMENT_BLOCK_GAP = 8
export const COMMENT_BODY_FONT = '12px Verdana, Geneva, sans-serif'
export const COMMENT_ITALIC_FONT = 'italic 12px Verdana, Geneva, sans-serif'
export const COMMENT_CODE_FONT = '12px monospace'

type PreparedCommentBlock =
  | {kind: 'paragraph'; flow: PreparedRichInline; runs: HNRun[]}
  | {kind: 'codeBlock'; prepared: PreparedTextWithSegments; text: string}

export type PreparedHNCommentDoc = {
  blocks: PreparedCommentBlock[]
}

export type HNCommentLayoutFragment = {
  kind: 'text' | 'italic' | 'link' | 'code'
  href: string | null
  text: string
  gapBefore: number
  left: number
  top: number
  width: number
  height: number
  textStart: number
  textEnd: number
}

export type HNCommentLayoutLine = {
  top: number
  width: number
  height: number
  textStart: number
  textEnd: number
  fragments: HNCommentLayoutFragment[]
}

export type HNCommentLayoutBlock =
  | {
      kind: 'paragraph'
      height: number
      lines: HNCommentLayoutLine[]
    }
  | {
      kind: 'codeBlock'
      height: number
      lines: HNCommentLayoutLine[]
    }

export type HNCommentLayout = {
  width: number
  height: number
  blocks: HNCommentLayoutBlock[]
}

export type HNCommentRect = {left: number; top: number; width: number; height: number}

const textWidthCache = new Map<string, number>()

export function prepareHNCommentDoc(doc: HNCommentDoc): PreparedHNCommentDoc {
  return {
    blocks: doc.blocks.map(block => {
      switch (block.kind) {
        case 'paragraph':
          return {
            kind: 'paragraph',
            flow: prepareParagraphFlow(block.runs),
            runs: block.runs,
          }

        case 'codeBlock':
          return {
            kind: 'codeBlock',
            prepared: prepareWithSegments(block.text, COMMENT_CODE_FONT, {whiteSpace: 'pre-wrap'}),
            text: block.text,
          }
      }
    }),
  }
}

export function layoutPreparedHNCommentDoc(doc: PreparedHNCommentDoc, maxWidth: number): HNCommentLayout {
  const safeWidth = Math.max(1, maxWidth)
  const blocks: HNCommentLayoutBlock[] = []
  let top = 0
  let textOffset = 0

  for (let blockIndex = 0; blockIndex < doc.blocks.length; blockIndex++) {
    const block = doc.blocks[blockIndex]!
    const gapBefore = blockIndex === 0 ? 0 : COMMENT_BLOCK_GAP
    top += gapBefore
    const blockTop = top

    switch (block.kind) {
      case 'paragraph': {
        const lines: HNCommentLayoutLine[] = []
        let blockHeight = 0

        walkRichInlineLineRanges(block.flow, safeWidth, lineRange => {
          const line = materializeRichInlineLineRange(block.flow, lineRange)
          const lineTop = blockTop + blockHeight
          const lineTextStart = textOffset
          const fragments: HNCommentLayoutFragment[] = []
          let left = 0

          for (let fragmentIndex = 0; fragmentIndex < line.fragments.length; fragmentIndex++) {
            const fragment = line.fragments[fragmentIndex]!
            const run = block.runs[fragment.itemIndex]!
            left += fragment.gapBefore
            if (fragmentIndex > 0 && fragment.gapBefore > 0) textOffset += 1

            const textStart = textOffset
            const textEnd = textStart + fragment.text.length
            const width = fragment.occupiedWidth
            const layoutFragment: HNCommentLayoutFragment = {
              kind: run.kind,
              href: run.kind === 'link' ? run.href : null,
              text: fragment.text,
              gapBefore: fragment.gapBefore,
              left,
              top: lineTop,
              width,
              height: COMMENT_LINE_HEIGHT,
              textStart,
              textEnd,
            }
            fragments.push(layoutFragment)
            left += width
            textOffset = textEnd
          }

          lines.push({
            top: lineTop,
            width: line.width,
            height: COMMENT_LINE_HEIGHT,
            textStart: lineTextStart,
            textEnd: textOffset,
            fragments,
          })
          blockHeight += COMMENT_LINE_HEIGHT
        })

        blocks.push({
          kind: 'paragraph',
          height: blockHeight,
          lines,
        })
        top += blockHeight
        break
      }

      case 'codeBlock': {
        const lines: HNCommentLayoutLine[] = []
        let blockHeight = 0
        let cursor: LayoutCursor = {segmentIndex: 0, graphemeIndex: 0}
        let sourceOffset = 0

        while (true) {
          const line = layoutNextLine(block.prepared, cursor, safeWidth)
          if (line == null) break

          const lineTop = blockTop + blockHeight
          const lineTextStart = textOffset
          const lineTextEnd = lineTextStart + line.text.length
          const fragment: HNCommentLayoutFragment = {
            kind: 'code',
            href: null,
            text: line.text,
            gapBefore: 0,
            left: 0,
            top: lineTop,
            width: line.width,
            height: COMMENT_LINE_HEIGHT,
            textStart: lineTextStart,
            textEnd: lineTextEnd,
          }

          lines.push({
            top: lineTop,
            width: line.width,
            height: COMMENT_LINE_HEIGHT,
            textStart: lineTextStart,
            textEnd: lineTextEnd,
            fragments: [fragment],
          })

          textOffset = lineTextEnd
          sourceOffset += line.text.length
          while (sourceOffset < block.text.length) {
            const lineBreakWidth = lineBreakCharCountAt(block.text, sourceOffset)
            if (lineBreakWidth === 0) break
            sourceOffset += lineBreakWidth
            textOffset += lineBreakWidth
          }

          blockHeight += COMMENT_LINE_HEIGHT
          cursor = line.end
        }

        blocks.push({
          kind: 'codeBlock',
          height: blockHeight,
          lines,
        })
        top += blockHeight
        break
      }
    }
  }

  return {
    width: safeWidth,
    height: top,
    blocks,
  }
}

export function renderHNCommentLayout(layout: HNCommentLayout): DocumentFragment {
  const fragment = document.createDocumentFragment()

  for (let blockIndex = 0; blockIndex < layout.blocks.length; blockIndex++) {
    const block = layout.blocks[blockIndex]!
    for (let lineIndex = 0; lineIndex < block.lines.length; lineIndex++) {
      const line = block.lines[lineIndex]!
      const lineNode = document.createElement('div')
      lineNode.className = block.kind === 'codeBlock' ? 'comment-line comment-code-line' : 'comment-line'
      lineNode.style.top = `${line.top}px`
      lineNode.style.height = `${line.height}px`

      for (let fragmentIndex = 0; fragmentIndex < line.fragments.length; fragmentIndex++) {
        const lineFragment = line.fragments[fragmentIndex]!
        if (lineFragment.gapBefore > 0) {
          const gapNode = document.createElement('span')
          gapNode.className = 'comment-gap'
          gapNode.style.left = `${lineFragment.left - lineFragment.gapBefore}px`
          gapNode.textContent = ' '
          lineNode.appendChild(gapNode)
        }

        const textNode = createFragmentNode(lineFragment)
        textNode.style.left = `${lineFragment.left}px`
        lineNode.appendChild(textNode)
      }

      fragment.appendChild(lineNode)
    }
  }

  return fragment
}

export function findHNCommentTextOffsetInEmptySpace(layout: HNCommentLayout, x: number, y: number) {
  let previousLine: HNCommentLayoutLine | null = null

  for (let blockIndex = 0; blockIndex < layout.blocks.length; blockIndex++) {
    const block = layout.blocks[blockIndex]!
    for (let lineIndex = 0; lineIndex < block.lines.length; lineIndex++) {
      const line = block.lines[lineIndex]!
      if (line.top <= y && y < line.top + line.height) {
        if (x < 0) return line.textStart
        if (x > line.width) return line.textEnd
        return null
      }
      if (y < line.top) {
        if (previousLine == null) return line.textStart
        return y < (previousLine.top + previousLine.height + line.top) / 2 ? previousLine.textEnd : line.textStart
      }
      previousLine = line
    }
  }

  return previousLine?.textEnd ?? null
}

export function resolveHNCommentTextOffset(root: Node, textOffset: number) {
  let remaining = Math.max(0, textOffset)
  let lastText: Text | null = null
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)

  while (true) {
    const next = walker.nextNode()
    if (next == null) break
    const textNode = next as Text
    lastText = textNode
    if (remaining <= textNode.length) return {node: textNode, offset: remaining}
    remaining -= textNode.length
  }

  return lastText == null ? null : {node: lastText, offset: lastText.length}
}

export function findHNCommentTextRects(layout: HNCommentLayout, start: number, length: number): HNCommentRect[] {
  if (length <= 0) return []

  const end = start + length
  const rects: HNCommentRect[] = []

  for (let blockIndex = 0; blockIndex < layout.blocks.length; blockIndex++) {
    const block = layout.blocks[blockIndex]!
    const firstLine = block.lines[0]
    const lastLine = block.lines.at(-1)
    if (firstLine == null || lastLine == null) continue
    if (end <= firstLine.textStart || start >= lastLine.textEnd) continue

    for (let lineIndex = 0; lineIndex < block.lines.length; lineIndex++) {
      const line = block.lines[lineIndex]!
      if (end <= line.textStart || start >= line.textEnd) continue

      for (let fragmentIndex = 0; fragmentIndex < line.fragments.length; fragmentIndex++) {
        const fragment = line.fragments[fragmentIndex]!
        if (end <= fragment.textStart || start >= fragment.textEnd) continue

        const fragmentStart = Math.max(0, start - fragment.textStart)
        const fragmentEnd = Math.min(fragment.text.length, end - fragment.textStart)
        if (fragmentEnd <= fragmentStart) continue

        const prefixWidth = measureFragmentTextWidth(fragment, fragment.text.slice(0, fragmentStart))
        const matchWidth = measureFragmentTextWidth(fragment, fragment.text.slice(fragmentStart, fragmentEnd))
        pushMergedRect(rects, {
          left: fragment.left + prefixWidth,
          top: fragment.top,
          width: matchWidth,
          height: fragment.height,
        })
      }
    }
  }

  return rects
}

function prepareParagraphFlow(runs: HNRun[]): PreparedRichInline {
  return prepareRichInline(
    runs.map(run => ({
      text: run.text,
      font: fontForRunKind(run.kind),
    })),
  )
}

function fontForRunKind(kind: HNRun['kind']) {
  return kind === 'italic' ? COMMENT_ITALIC_FONT : COMMENT_BODY_FONT
}

function createFragmentNode(fragment: HNCommentLayoutFragment) {
  let node: HTMLElement
  switch (fragment.kind) {
    case 'text':
      node = document.createElement('span')
      break

    case 'italic':
      node = document.createElement('i')
      break

    case 'link': {
      const link = document.createElement('a')
      link.href = fragment.href ?? ''
      node = link
      break
    }

    case 'code':
      node = document.createElement('span')
      node.className = 'comment-code-fragment'
      break
  }
  node.classList.add('comment-fragment')
  node.textContent = fragment.text
  return node
}

function lineBreakCharCountAt(text: string, index: number) {
  const ch = text[index]
  if (ch === '\r' && text[index + 1] === '\n') return 2
  if (ch === '\r' || ch === '\n') return 1
  return 0
}

function measureFragmentTextWidth(fragment: HNCommentLayoutFragment, text: string) {
  if (text === '') return 0
  const font = fontForFragmentKind(fragment.kind)
  const whiteSpace = whiteSpaceForFragmentKind(fragment.kind)
  const key = `${font}\u0000${whiteSpace}\u0000${text}`
  const cached = textWidthCache.get(key)
  if (cached != null) return cached
  const prepared = prepareWithSegments(text, font, {whiteSpace})
  const width = measureNaturalWidth(prepared)
  textWidthCache.set(key, width)
  return width
}

function fontForFragmentKind(kind: HNCommentLayoutFragment['kind']) {
  switch (kind) {
    case 'italic':
      return COMMENT_ITALIC_FONT
    case 'code':
      return COMMENT_CODE_FONT
    case 'text':
    case 'link':
      return COMMENT_BODY_FONT
  }
}

function whiteSpaceForFragmentKind(kind: HNCommentLayoutFragment['kind']) {
  return kind === 'code' ? 'pre-wrap' : 'normal'
}

function pushMergedRect(rects: HNCommentRect[], next: HNCommentRect) {
  const previous = rects[rects.length - 1]
  if (
    previous != null &&
    previous.top === next.top &&
    previous.height === next.height &&
    Math.abs(previous.left + previous.width - next.left) < 0.5
  ) {
    previous.width = next.left + next.width - previous.left
    return
  }
  rects.push(next)
}
