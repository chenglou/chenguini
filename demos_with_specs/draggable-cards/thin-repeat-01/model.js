export const CARD_WIDTH = 320
export const TOP_PADDING = 50
export const VERTICAL_GAP = 0
export const POINTER_HISTORY_WINDOW_MS = 100

export function hash(n) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

export function makeCards(count = 5) {
  const cards = []
  for (let i = 0; i < count; i += 1) {
    cards.push({
      id: `card-${i}`,
      title: `Card ${i + 1}`,
      sizeY: 30 + hash(i * 2) * 150,
      lightnessBase: hash(i * 2 + 1) * 40 + 40,
    })
  }
  return cards
}

function getCard(cards, cardId) {
  for (const card of cards) {
    if (card.id === cardId) {
      return card
    }
  }
  throw new Error(`Missing card ${cardId}`)
}

export function getCenteredX(windowWidth, rowSizeX = CARD_WIDTH) {
  return (windowWidth - rowSizeX) / 2
}

export function getStackLayout({ cards, orderedCardIds, topPadding = TOP_PADDING }) {
  const layout = []
  let y = topPadding

  for (const cardId of orderedCardIds) {
    const card = getCard(cards, cardId)
    layout.push({
      id: cardId,
      y,
      sizeY: card.sizeY,
      centerY: y + card.sizeY / 2,
    })
    y += card.sizeY + VERTICAL_GAP
  }

  return layout
}

export function reorderByMidpoint({ cards, orderedCardIds, draggedCardId, draggedCenterY }) {
  const nextOrder = [...orderedCardIds]
  let draggedIndex = nextOrder.indexOf(draggedCardId)
  if (draggedIndex === -1) {
    throw new Error(`Missing dragged card ${draggedCardId} in orderedCardIds`)
  }

  const initialLayout = getStackLayout({ cards, orderedCardIds: nextOrder })
  const initialCenterY = initialLayout[draggedIndex].centerY

  if (draggedCenterY > initialCenterY) {
    while (draggedIndex < nextOrder.length - 1) {
      const layout = getStackLayout({ cards, orderedCardIds: nextOrder })
      const currentCenterY = layout[draggedIndex].centerY
      const nextCenterY = layout[draggedIndex + 1].centerY
      const midpointY = (currentCenterY + nextCenterY) / 2
      if (draggedCenterY <= midpointY) {
        break
      }

      const swap = nextOrder[draggedIndex]
      nextOrder[draggedIndex] = nextOrder[draggedIndex + 1]
      nextOrder[draggedIndex + 1] = swap
      draggedIndex += 1
    }
  } else if (draggedCenterY < initialCenterY) {
    while (draggedIndex > 0) {
      const layout = getStackLayout({ cards, orderedCardIds: nextOrder })
      const currentCenterY = layout[draggedIndex].centerY
      const previousCenterY = layout[draggedIndex - 1].centerY
      const midpointY = (currentCenterY + previousCenterY) / 2
      if (draggedCenterY >= midpointY) {
        break
      }

      const swap = nextOrder[draggedIndex]
      nextOrder[draggedIndex] = nextOrder[draggedIndex - 1]
      nextOrder[draggedIndex - 1] = swap
      draggedIndex -= 1
    }
  }

  return nextOrder
}

export function trimPointerHistory(pointerHistory, now) {
  const trimmed = []
  for (const point of pointerHistory) {
    if (now - point.time <= POINTER_HISTORY_WINDOW_MS) {
      trimmed.push(point)
    }
  }

  if (trimmed.length === 0 && pointerHistory.length > 0) {
    trimmed.push(pointerHistory[pointerHistory.length - 1])
  }

  return trimmed.length <= 20 ? trimmed : trimmed.slice(trimmed.length - 20)
}

export function estimateReleaseVelocity(pointerHistory, now) {
  if (pointerHistory.length === 0) {
    return { x: 0, y: 0 }
  }

  const trimmed = trimPointerHistory(pointerHistory, now)
  const first = trimmed[0]
  const last = trimmed[trimmed.length - 1]
  const dt = Math.max(1, now - first.time)

  return {
    x: ((last.x - first.x) / dt) * 1000,
    y: ((last.y - first.y) / dt) * 1000,
  }
}

export function cardZIndex({ cardId, orderedCardIds, draggedCardId, lastDraggedCardId }) {
  if (draggedCardId === cardId) {
    return 300
  }
  if (draggedCardId == null && lastDraggedCardId === cardId) {
    return 200
  }
  return 10 + orderedCardIds.indexOf(cardId)
}
