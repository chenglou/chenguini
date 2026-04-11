// Extracted from pretex-editor's page-break bundle logic, but normalized into a
// generic paginated block flow with promotable top-float bundles.

export type FlowBlockKind = 'heading' | 'topFloat' | 'body'

export type FlowBlock = {
  sourceIndex: number
  kind: FlowBlockKind
  totalHeight: number
  keepWithNext: 0 | 1
}

export type PromotedBundle = {
  heading: FlowBlock
  floats: FlowBlock[]
  nextIndex: number
  totalHeight: number
}

export type PromotedBundleSummary = {
  floatCount: number
  nextIndex: number
  totalHeight: number
  fitsOnFreshPage: 0 | 1
}

export type PageAssignment = {
  pageIndex: number
  blocks: FlowBlock[]
  usedHeight: number
  remainingHeight: number
}

function appendBlockToPage(page: PageAssignment, block: FlowBlock): PageAssignment {
  const nextBlocks: FlowBlock[] = []
  for (let blockIndex = 0; blockIndex < page.blocks.length; blockIndex++) {
    nextBlocks.push(page.blocks[blockIndex]!)
  }
  nextBlocks.push(block)

  return {
    pageIndex: page.pageIndex,
    blocks: nextBlocks,
    usedHeight: page.usedHeight + block.totalHeight,
    remainingHeight: page.remainingHeight - block.totalHeight,
  }
}

function isTopFloat(kind: FlowBlockKind): boolean {
  return kind === 'topFloat'
}

function isReorderableHeading(kind: FlowBlockKind): boolean {
  return kind === 'heading'
}

export function summarizePromotedBundle(
  headingHeight: number,
  floatHeights: number[],
  pageHeight: number,
): PromotedBundleSummary {
  let totalHeight = headingHeight
  for (let floatIndex = 0; floatIndex < floatHeights.length; floatIndex++) {
    totalHeight += floatHeights[floatIndex]!
  }
  return {
    floatCount: floatHeights.length,
    nextIndex: floatHeights.length + 1,
    totalHeight,
    fitsOnFreshPage: totalHeight <= pageHeight ? 1 : 0,
  }
}

export function canPromoteFollowingTopFloats(
  blocks: FlowBlock[],
  startIndex: number,
  pageHeight: number,
): PromotedBundle | null {
  const heading = blocks[startIndex]
  if (heading == null || isReorderableHeading(heading.kind) === false) return null

  const floats: FlowBlock[] = []
  let cursor = startIndex + 1
  while (cursor < blocks.length && isTopFloat(blocks[cursor]!.kind)) {
    floats.push(blocks[cursor]!)
    cursor += 1
  }
  if (floats.length === 0) return null

  let totalHeight = heading.totalHeight
  for (let floatIndex = 0; floatIndex < floats.length; floatIndex++) {
    totalHeight += floats[floatIndex]!.totalHeight
  }
  if (totalHeight > pageHeight) return null

  return {
    heading,
    floats,
    nextIndex: cursor,
    totalHeight,
  }
}

export function paginateBlockFlow(
  blocks: FlowBlock[],
  pageHeight: number,
): PageAssignment[] {
  const pages: PageAssignment[] = []
  let current: PageAssignment = {
    pageIndex: 0,
    blocks: [],
    usedHeight: 0,
    remainingHeight: pageHeight,
  }

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const block = blocks[blockIndex]!
    const promotedBundle = canPromoteFollowingTopFloats(blocks, blockIndex, pageHeight)
    const hasNextBlock = blockIndex + 1 < blocks.length
    const nextBlock = hasNextBlock ? blocks[blockIndex + 1]! : null
    const keepPair = block.keepWithNext === 1 && nextBlock != null
    const pairHeight = keepPair ? block.totalHeight + nextBlock.totalHeight : block.totalHeight
    const requiredHeight = promotedBundle == null ? pairHeight : promotedBundle.totalHeight
    const needsNewPage =
      current.blocks.length > 0
      && (promotedBundle != null || current.remainingHeight < requiredHeight)

    if (needsNewPage) {
      pages.push(current)
      current = {
        pageIndex: pages.length,
        blocks: [],
        usedHeight: 0,
        remainingHeight: pageHeight,
      }
    }

    if (current.blocks.length === 0 && promotedBundle != null) {
      for (let floatIndex = 0; floatIndex < promotedBundle.floats.length; floatIndex++) {
        current = appendBlockToPage(current, promotedBundle.floats[floatIndex]!)
      }
      current = appendBlockToPage(current, promotedBundle.heading)
      blockIndex = promotedBundle.nextIndex - 1
      continue
    }

    current = appendBlockToPage(current, block)
  }

  if (current.blocks.length > 0) pages.push(current)
  return pages
}
