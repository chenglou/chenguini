export type PointerSample = {
  x: number
  y: number
  time: number
}

export type Velocity = {
  x: number
  y: number
}

export type ReorderResult = {
  orderedCardIds: number[]
  draggedOrderIndex: number
  swapCount: number
}

export function hash(n: number) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

export function applyReorderThresholds(_args: {
  orderedCardIds: number[]
  draggedCardId: number
  pointerY: number
  topPadding: number
  getCardHeight(cardId: number): number
}): ReorderResult {
  const orderedCardIds = _args.orderedCardIds.slice()
  let draggedOrderIndex = orderedCardIds.indexOf(_args.draggedCardId)
  if (draggedOrderIndex === -1) {
    throw new Error(`Dragged card ${_args.draggedCardId} is missing from the order`)
  }

  let swapCount = 0
  while (draggedOrderIndex > 0) {
    const previousCardIndex = draggedOrderIndex - 1
    const previousCardMidpoint = getCardMidpoint({
      orderedCardIds,
      cardIndex: previousCardIndex,
      topPadding: _args.topPadding,
      getCardHeight: _args.getCardHeight,
    })
    if (_args.pointerY >= previousCardMidpoint) break

    const previousCardId = orderedCardIds[previousCardIndex]!
    orderedCardIds[previousCardIndex] = _args.draggedCardId
    orderedCardIds[draggedOrderIndex] = previousCardId
    draggedOrderIndex = previousCardIndex
    swapCount++
  }

  while (draggedOrderIndex < orderedCardIds.length - 1) {
    const nextCardIndex = draggedOrderIndex + 1
    const nextCardMidpoint = getCardMidpoint({
      orderedCardIds,
      cardIndex: nextCardIndex,
      topPadding: _args.topPadding,
      getCardHeight: _args.getCardHeight,
    })
    if (_args.pointerY <= nextCardMidpoint) break

    const nextCardId = orderedCardIds[nextCardIndex]!
    orderedCardIds[nextCardIndex] = _args.draggedCardId
    orderedCardIds[draggedOrderIndex] = nextCardId
    draggedOrderIndex = nextCardIndex
    swapCount++
  }

  return { orderedCardIds, draggedOrderIndex, swapCount }
}

export function estimateReleaseVelocity(_args: {
  samples: PointerSample[]
  now: number
}): Velocity {
  if (_args.samples.length < 2) return { x: 0, y: 0 }

  const lastSample = _args.samples[_args.samples.length - 1]!
  let firstRecentSample = lastSample
  for (let sampleIndex = _args.samples.length - 2; sampleIndex >= 0; sampleIndex--) {
    const sample = _args.samples[sampleIndex]!
    if (_args.now - sample.time > 100) break
    firstRecentSample = sample
  }

  const dt = _args.now - firstRecentSample.time
  if (dt <= 0) return { x: 0, y: 0 }

  return {
    x: ((lastSample.x - firstRecentSample.x) / dt) * 1000,
    y: ((lastSample.y - firstRecentSample.y) / dt) * 1000,
  }
}

function getCardMidpoint(args: {
  orderedCardIds: number[]
  cardIndex: number
  topPadding: number
  getCardHeight(cardId: number): number
}) {
  let top = args.topPadding
  for (let index = 0; index < args.cardIndex; index++) {
    top += args.getCardHeight(args.orderedCardIds[index]!)
  }
  const cardHeight = args.getCardHeight(args.orderedCardIds[args.cardIndex]!)
  return top + cardHeight / 2
}
