import {
  layout,
  layoutNextLine,
  prepare,
  prepareWithSegments,
  walkLineRanges,
  type LayoutCursor,
  type PreparedText,
  type PreparedTextWithSegments,
} from '@chenglou/pretext'
import {type HNCommentDoc, type HNRun} from './hn-comment-parser'

const COMMENT_LINE_HEIGHT = 14
const COMMENT_BLOCK_GAP = 8
const COMMENT_BODY_FONT = '12px Verdana, Geneva, sans-serif'
const COMMENT_ITALIC_FONT = 'italic 12px Verdana, Geneva, sans-serif'
const COMMENT_CODE_FONT = '12px monospace'
const LINE_START_CURSOR: LayoutCursor = {segmentIndex: 0, graphemeIndex: 0}
const UNBOUNDED_WIDTH = 100_000

type PreparedParagraphItem = {
  endCursor: LayoutCursor
  fullWidth: number
  leadingGap: number
  prepared: PreparedTextWithSegments
}

type PreparedCommentBlock =
  | {kind: 'paragraph'; items: PreparedParagraphItem[]}
  | {kind: 'codeBlock'; prepared: PreparedText}

export type PreparedHNCommentDoc = {
  blocks: PreparedCommentBlock[]
}

const collapsedSpaceWidthCache = new Map<string, number>()
const INLINE_BOUNDARY_GAP = measureCollapsedSpaceWidth(COMMENT_BODY_FONT)

export function prepareHNCommentDoc(doc: HNCommentDoc): PreparedHNCommentDoc {
  return {
    blocks: doc.blocks.map(block => {
      switch (block.kind) {
        case 'paragraph':
          return {kind: 'paragraph', items: prepareParagraphItems(block.runs)}

        case 'codeBlock':
          return {
            kind: 'codeBlock',
            prepared: prepare(block.text, COMMENT_CODE_FONT, {whiteSpace: 'pre-wrap'}),
          }
      }
    }),
  }
}

export function measureHNCommentDoc(doc: PreparedHNCommentDoc, maxWidth: number): number {
  let height = 0

  for (let i = 0; i < doc.blocks.length; i++) {
    const block = doc.blocks[i]!
    if (i > 0) height += COMMENT_BLOCK_GAP

    switch (block.kind) {
      case 'paragraph':
        height += measureParagraphHeight(block.items, maxWidth)
        break

      case 'codeBlock':
        height += layout(block.prepared, Math.max(1, maxWidth), COMMENT_LINE_HEIGHT).height
        break
    }
  }

  return height
}

function measureParagraphHeight(items: PreparedParagraphItem[], maxWidth: number): number {
  return measureParagraphLineCount(items, maxWidth) * COMMENT_LINE_HEIGHT
}

function measureParagraphLineCount(items: PreparedParagraphItem[], maxWidth: number): number {
  const safeWidth = Math.max(1, maxWidth)
  let lineCount = 0
  let itemIndex = 0
  let textCursor: LayoutCursor | null = null

  while (itemIndex < items.length) {
    let lineHasContent = false
    let lineWidth = 0
    let remainingWidth = safeWidth

    lineLoop:
    while (itemIndex < items.length) {
      const item = items[itemIndex]!

      if (textCursor !== null && cursorsMatch(textCursor, item.endCursor)) {
        itemIndex++
        textCursor = null
        continue
      }

      const leadingGap = lineHasContent ? item.leadingGap : 0
      if (textCursor === null) {
        const fullWidth = leadingGap + item.fullWidth
        if (fullWidth <= remainingWidth) {
          lineHasContent = true
          lineWidth += fullWidth
          remainingWidth = Math.max(0, safeWidth - lineWidth)
          itemIndex++
          continue
        }
      }

      if (lineHasContent && leadingGap >= remainingWidth) break lineLoop

      const startCursor = textCursor ?? LINE_START_CURSOR
      const line = layoutNextLine(
        item.prepared,
        startCursor,
        Math.max(1, remainingWidth - leadingGap),
      )
      if (line === null) {
        itemIndex++
        textCursor = null
        continue
      }
      if (cursorsMatch(startCursor, line.end)) {
        itemIndex++
        textCursor = null
        continue
      }

      lineHasContent = true
      lineWidth += leadingGap + line.width
      remainingWidth = Math.max(0, safeWidth - lineWidth)

      if (cursorsMatch(line.end, item.endCursor)) {
        itemIndex++
        textCursor = null
        continue
      }

      textCursor = line.end
      break lineLoop
    }

    if (!lineHasContent) break
    lineCount++
  }

  return lineCount
}

function prepareParagraphItems(runs: HNRun[]): PreparedParagraphItem[] {
  const items: PreparedParagraphItem[] = []
  let pendingGap = 0

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i]!
    const carryGap = pendingGap
    const hasLeadingWhitespace = /^\s/.test(run.text)
    const hasTrailingWhitespace = /\s$/.test(run.text)
    const trimmedText = run.text.trim()
    pendingGap = hasTrailingWhitespace ? INLINE_BOUNDARY_GAP : 0
    if (trimmedText.length === 0) continue

    const font = run.kind === 'italic' ? COMMENT_ITALIC_FONT : COMMENT_BODY_FONT
    const prepared = prepareWithSegments(trimmedText, font)
    const fullLine = layoutNextLine(prepared, LINE_START_CURSOR, UNBOUNDED_WIDTH)
    if (fullLine === null) continue

    items.push({
      endCursor: fullLine.end,
      fullWidth: fullLine.width,
      leadingGap: carryGap > 0 || hasLeadingWhitespace ? INLINE_BOUNDARY_GAP : 0,
      prepared,
    })
  }

  return items
}

function cursorsMatch(a: LayoutCursor, b: LayoutCursor): boolean {
  return a.segmentIndex === b.segmentIndex && a.graphemeIndex === b.graphemeIndex
}

function measureSingleLineWidth(prepared: PreparedTextWithSegments): number {
  let maxWidth = 0
  walkLineRanges(prepared, UNBOUNDED_WIDTH, line => {
    if (line.width > maxWidth) maxWidth = line.width
  })
  return maxWidth
}

function measureCollapsedSpaceWidth(font: string): number {
  const cached = collapsedSpaceWidthCache.get(font)
  if (cached !== undefined) return cached

  const joinedWidth = measureSingleLineWidth(prepareWithSegments('A A', font))
  const compactWidth = measureSingleLineWidth(prepareWithSegments('AA', font))
  const collapsedWidth = Math.max(0, joinedWidth - compactWidth)
  collapsedSpaceWidthCache.set(font, collapsedWidth)
  return collapsedWidth
}
