import { describe, expect, test } from 'bun:test'
import {
  computeColumnCount,
  computeGridBoxSize,
  computeGridLayout,
} from '../layout'

const landscapePhoto = {
  id: 'landscape',
  w: 2304,
  h: 1536,
  prompt: 'Landscape',
}

const squarePhoto = {
  id: 'square',
  w: 1024,
  h: 1024,
  prompt: 'Square',
}

const portraitPhoto = {
  id: 'portrait',
  w: 1024,
  h: 1536,
  prompt: 'Portrait',
}

describe('grid layout math', () => {
  test('responsive column count respects the min visual width and max columns', () => {
    expect(computeColumnCount(480)).toBe(2)
    expect(computeColumnCount(980)).toBe(4)
    expect(computeColumnCount(2400)).toBe(7)
  })

  test('area-aware sizing shrinks square images and gives portraits extra visual room', () => {
    const landscape = computeGridBoxSize(landscapePhoto, 300)
    const square = computeGridBoxSize(squarePhoto, 300)
    const portrait = computeGridBoxSize(portraitPhoto, 300)

    expect(landscape.imageWidth).toBeCloseTo(300, 5)
    expect(landscape.imageHeight).toBeCloseTo(200, 5)

    expect(square.imageWidth).toBeCloseTo(255, 5)
    expect(square.imageHeight).toBeCloseTo(255, 5)

    expect(portrait.imageWidth).toBeCloseTo(210, 5)
    expect(portrait.imageHeight).toBeCloseTo(315, 5)

    expect(square.imageWidth).toBeLessThan(landscape.imageWidth)
    expect(portrait.imageHeight).toBeGreaterThan(square.imageHeight)
  })

  test('row layout keeps the top padding and advances by the tallest card in each row', () => {
    const layout = computeGridLayout(
      [landscapePhoto, squarePhoto, portraitPhoto, landscapePhoto],
      980,
    )

    expect(layout.columnCount).toBe(4)
    expect(layout.cards[0]!.y).toBe(40)
    expect(layout.cards[1]!.y).toBe(40)
    expect(layout.cards[2]!.y).toBe(40)
    expect(layout.cards[3]!.y).toBe(40)

    const secondRow = computeGridLayout(
      [
        landscapePhoto,
        squarePhoto,
        portraitPhoto,
        landscapePhoto,
        portraitPhoto,
      ],
      980,
    )
    const expectedSecondRowY = 40 + secondRow.rows[0]!.height + 24
    expect(secondRow.cards[4]!.y).toBeCloseTo(expectedSecondRowY, 5)
  })
})
