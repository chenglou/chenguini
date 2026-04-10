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
  shrinkSingleLineWidth: boolean,
): PromptLayout {
  const innerMaxWidth = Math.max(1, outerMaxWidth - promptPaddingX * 2)
  const lines: PromptLine[] = []
  let cursor: RichInlineCursor | undefined
  let lineCount = 0
  let maxLineWidth = 0

  while (true) {
    const range = layoutNextRichInlineLineRange(prompt.prepared, innerMaxWidth, cursor)
    if (range === null) break
    lineCount++
    if (range.width > maxLineWidth) maxLineWidth = range.width
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

  const visibleLineCount = Math.min(lineCount, maxLines)
  const visibleHeight = promptPaddingTop + visibleLineCount * lineHeight
  if (shrinkSingleLineWidth && lineCount === 1) {
    return {
      width: Math.min(outerMaxWidth, promptPaddingX * 2 + maxLineWidth),
      lineCount: 1,
      visibleHeight,
      lines,
    }
  }
  return {width: outerMaxWidth, lineCount, visibleHeight, lines}
}
