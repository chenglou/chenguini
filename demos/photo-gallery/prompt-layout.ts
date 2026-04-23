import {
  layoutNextRichInlineLineRange,
  materializeRichInlineLineRange,
  prepareRichInline,
  type PreparedRichInline,
  type RichInlineCursor,
} from '@chenglou/pretext/rich-inline'

export const promptPaddingTop = 8
export const promptPaddingBottom = 8
export const promptPaddingX = 12
export const prompt2DMaxLines = 2
export const prompt2DVisibleHeight = 44
export const prompt2DLineHeight = (prompt2DVisibleHeight - promptPaddingTop) / prompt2DMaxLines
export const prompt1DMaxLines = 3
export const prompt1DVisibleHeight = 64
export const prompt1DLineHeight = (prompt1DVisibleHeight - promptPaddingTop) / prompt1DMaxLines
export const promptTextPrefix = '\u275D\u202F'

const promptFont = `14px "DM Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"`

export type PreparedPrompt = {
  prepared: PreparedRichInline
}

export type PromptLayout = {
  width: number
  lineCount: number
  visibleHeight: number
  lines: PromptLine[]
}

export type PromptFragment = {
  itemIndex: number
  text: string
  gapBefore: number
}

export type PromptLine = {
  fragments: PromptFragment[]
  width: number
}

/** @fit
 * result: int 0..10
 * result <= lineCount
 * result <= maxLines
 */
function visiblePromptLineCount(
  lineCount: number, // @fit int 0..200
  maxLines: number, // @fit int 0..10
) {
  return Math.min(lineCount, maxLines)
}

/** @fit
 * result: 8..1008
 * result >= promptPaddingTop
 * result == promptPaddingTop + visibleLineCount * lineHeight
 */
function promptVisibleHeightForLineCount(
  visibleLineCount: number, // @fit int 0..10
  lineHeight: number, // @fit 0..100
) {
  return promptPaddingTop + visibleLineCount * lineHeight
}

function promptInnerMaxWidth(
  outerMaxWidth: number, // @fit 0..10000
) {
  // @fit >= 1
  return Math.max(1, outerMaxWidth - promptPaddingX * 2)
}

export function preparePrompt(prompt: string): PreparedPrompt {
  return {
    prepared: prepareRichInline([
      {text: promptTextPrefix, font: promptFont, break: 'never'},
      {text: prompt, font: promptFont},
    ]),
  }
}

export function measurePromptLayout(
  prompt: PreparedPrompt,
  outerMaxWidth: number,
  maxLines: number,
  lineHeight: number,
): PromptLayout {
  const innerMaxWidth = promptInnerMaxWidth(outerMaxWidth)
  const lines: PromptLine[] = []
  let cursor: RichInlineCursor | undefined
  let lineCount = 0

  while (true) {
    const range = layoutNextRichInlineLineRange(prompt.prepared, innerMaxWidth, cursor)
    if (range === null) break
    lineCount++
    if (lines.length < maxLines) {
      const line = materializeRichInlineLineRange(prompt.prepared, range)
      lines.push({
        width: line.width,
        fragments: line.fragments.map(fragment => ({
          itemIndex: fragment.itemIndex,
          text: fragment.text,
          gapBefore: fragment.gapBefore,
        })),
      })
    }
    cursor = range.end
  }

  return finishPromptLayout(outerMaxWidth, lineCount, maxLines, lineHeight, lines)
}

function finishPromptLayout(
  outerMaxWidth: number, // @fit 0..10000
  lineCount: number, // @fit int 0..200
  maxLines: number, // @fit int 0..10
  lineHeight: number, // @fit 0..100
  lines: PromptLine[],
): PromptLayout {
  const visibleLineCount = visiblePromptLineCount(lineCount, maxLines)
  return {
    width: outerMaxWidth, // @fit == outerMaxWidth
    lineCount,
    visibleHeight: promptVisibleHeightForLineCount(visibleLineCount, lineHeight), // @fit 8..1008
    lines,
  }
}
