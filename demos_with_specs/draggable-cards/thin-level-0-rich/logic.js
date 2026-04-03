export const CARD_COUNT = 5
export const ROW_SIZE_X = 320
export const TOP_PADDING_Y = 50
export const DRAG_SCALE = 1.1
export const DRAG_OPACITY = 0.7
export const MS_PER_ANIMATION_STEP = 4
export const SPRING_STIFFNESS = 290
export const SPRING_DAMPING = 24

export function hash(n) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

export function createCardMetrics(cardCount = CARD_COUNT) {
  return Array.from({ length: cardCount }, (_, id) => {
    return {
      id,
      lightnessBase: hash(id * 2 + 1) * 40 + 40,
      sizeY: 30 + hash(id * 2) * 150,
    }
  })
}

export function buildCardRects(orderedCardIds, cardMetrics, topPaddingY = TOP_PADDING_Y) {
  const metricsById = new Map(cardMetrics.map((metric) => [metric.id, metric]))
  let topY = topPaddingY

  return orderedCardIds.map((id) => {
    const metric = metricsById.get(id)
    if (!metric) {
      throw new Error(`Missing card metric for id ${id}`)
    }

    const rect = {
      id,
      midpointY: topY + metric.sizeY / 2,
      sizeY: metric.sizeY,
      topY,
    }

    topY += metric.sizeY
    return rect
  })
}

export function reorderByMidpoint({ orderedCardIds, draggedId, pointerY, slots }) {
  const slotById = new Map(slots.map((slot) => [slot.id, slot]))
  const remainingIds = orderedCardIds.filter((id) => id !== draggedId)

  let insertIndex = remainingIds.findIndex((id) => {
    const slot = slotById.get(id)
    return slot ? pointerY < slot.midpointY : false
  })

  if (insertIndex === -1) {
    insertIndex = remainingIds.length
  }

  return [
    ...remainingIds.slice(0, insertIndex),
    draggedId,
    ...remainingIds.slice(insertIndex),
  ]
}

export function estimateReleaseVelocity(pointerSamples, now, windowMs = 100) {
  if (pointerSamples.length < 2) {
    return { x: 0, y: 0 }
  }

  const sortedSamples = [...pointerSamples].sort((left, right) => left.timeMs - right.timeMs)
  const windowStart = now - windowMs
  const endSample = findLatestSampleAtOrBefore(sortedSamples, now) ?? sortedSamples[sortedSamples.length - 1]
  const startSample =
    interpolateSampleAt(sortedSamples, windowStart) ??
    findEarliestSampleAtOrAfter(sortedSamples, windowStart) ??
    sortedSamples[0]

  const durationMs = Math.max(1, endSample.timeMs - startSample.timeMs)

  return {
    x: (endSample.x - startSample.x) / durationMs,
    y: (endSample.y - startSample.y) / durationMs,
  }
}

export function computeDragX({ deltaX, pointerX, rowSizeX = ROW_SIZE_X, windowWidth }) {
  const rawX = pointerX - deltaX
  const centeredX = (windowWidth - rowSizeX) / 2
  return rawX + (centeredX - rawX) / 1.5
}

function findLatestSampleAtOrBefore(pointerSamples, timeMs) {
  for (let index = pointerSamples.length - 1; index >= 0; index -= 1) {
    if (pointerSamples[index].timeMs <= timeMs) {
      return pointerSamples[index]
    }
  }

  return null
}

function findEarliestSampleAtOrAfter(pointerSamples, timeMs) {
  return pointerSamples.find((sample) => sample.timeMs >= timeMs) ?? null
}

function interpolateSampleAt(pointerSamples, timeMs) {
  let previous = null

  for (const sample of pointerSamples) {
    if (sample.timeMs === timeMs) {
      return sample
    }

    if (sample.timeMs > timeMs) {
      if (!previous || sample.timeMs === previous.timeMs) {
        return null
      }

      const ratio = (timeMs - previous.timeMs) / (sample.timeMs - previous.timeMs)

      return {
        timeMs,
        x: previous.x + (sample.x - previous.x) * ratio,
        y: previous.y + (sample.y - previous.y) * ratio,
      }
    }

    previous = sample
  }

  return null
}
