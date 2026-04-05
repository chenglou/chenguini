import {
  measureRichInline,
  prepareRichInline,
  walkRichInlineLines,
  type PreparedRichInline,
} from '../../../pretext/src/rich-inline'
import {
  layout,
  layoutWithLines,
  prepareWithSegments,
  type PreparedTextWithSegments,
} from '../../../pretext/src/layout'
import {type HNCommentDoc, type HNRun} from './hn-comment-parser'

// This file doubles as the demo's layout helper and as a convenient seam for
// semantic checks. That is a local choice for this demo, not a repo-wide rule.

export const COMMENT_LINE_HEIGHT = 14
export const COMMENT_BLOCK_GAP = 8
export const COMMENT_BODY_FONT = '12px Verdana, Geneva, sans-serif'
export const COMMENT_ITALIC_FONT = 'italic 12px Verdana, Geneva, sans-serif'
export const COMMENT_CODE_FONT = '12px monospace'

type PreparedCommentBlock =
  | {kind: 'paragraph'; flow: PreparedRichInline; runs: HNRun[]}
  | {kind: 'codeBlock'; prepared: PreparedTextWithSegments}

export type PreparedHNCommentDoc = {
  blocks: PreparedCommentBlock[]
}

export type HNCommentLayoutFragment = {
  gapBefore: number
  kind: HNRun['kind']
  text: string
}

export type HNCommentLayoutLine = {
  fragments: HNCommentLayoutFragment[]
  text: string
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
      lines: string[]
    }

export type HNCommentLayout = {
  blocks: HNCommentLayoutBlock[]
  height: number
}

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
        height += measureRichInline(block.flow, maxWidth, COMMENT_LINE_HEIGHT).height
        break

      case 'codeBlock':
        height += layout(block.prepared, Math.max(1, maxWidth), COMMENT_LINE_HEIGHT).height
        break
    }
  }

  return height
}

export function layoutPreparedHNCommentDoc(doc: PreparedHNCommentDoc, maxWidth: number): HNCommentLayout {
  const safeWidth = Math.max(1, maxWidth)
  const blocks: HNCommentLayoutBlock[] = []
  let height = 0

  for (let i = 0; i < doc.blocks.length; i++) {
    const block = doc.blocks[i]!
    if (i > 0) height += COMMENT_BLOCK_GAP

    switch (block.kind) {
      case 'paragraph': {
        const lines: HNCommentLayoutLine[] = []
        const lineCount = walkRichInlineLines(block.flow, safeWidth, line => {
          const fragments = line.fragments.map(fragment => ({
            gapBefore: fragment.gapBefore,
            kind: block.runs[fragment.itemIndex]!.kind,
            text: fragment.text,
          }))
          lines.push({
            fragments,
            text: lineTextFromFragments(fragments),
          })
        })
        const blockHeight = lineCount * COMMENT_LINE_HEIGHT
        blocks.push({
          kind: 'paragraph',
          height: blockHeight,
          lines,
        })
        height += blockHeight
        break
      }

      case 'codeBlock': {
        const laidOut = layoutWithLines(block.prepared, safeWidth, COMMENT_LINE_HEIGHT)
        blocks.push({
          kind: 'codeBlock',
          height: laidOut.height,
          lines: laidOut.lines.map(line => line.text),
        })
        height += laidOut.height
        break
      }
    }
  }

  return { blocks, height }
}

export function layoutHNCommentDoc(doc: HNCommentDoc, maxWidth: number): HNCommentLayout {
  return layoutPreparedHNCommentDoc(prepareHNCommentDoc(doc), maxWidth)
}

function prepareParagraphFlow(runs: HNRun[]): PreparedRichInline {
  return prepareRichInline(
    runs.map(run => ({
      text: run.text,
      font: run.kind === 'italic' ? COMMENT_ITALIC_FONT : COMMENT_BODY_FONT,
    })),
  )
}

function lineTextFromFragments(fragments: HNCommentLayoutFragment[]): string {
  let text = ''
  for (let i = 0; i < fragments.length; i++) {
    const fragment = fragments[i]!
    if (i > 0 && fragment.gapBefore > 0) text += ' '
    text += fragment.text
  }
  return text
}
