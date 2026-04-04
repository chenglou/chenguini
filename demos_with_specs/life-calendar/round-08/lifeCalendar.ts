export const gridGap = 8
export const tooltipWidth = 220
export const tooltipPadding = '8px 16px'
export const tooltipBorderRadius = 6
export const tooltipOffsetX = -110
export const tooltipOffsetY = -36
export const bodyBackground = '#22272e'
export const emptyBlockColor = 'hsl(214, 13%, 25%)'
export const filledBlockColor = '#39d353'
export const currentDayColor = '#006d32'
export const finalDayColor = 'red'
export const leftBlockRadius = [99, 0, 0, 99] as const
export const rightBlockRadius = [0, 99, 99, 0] as const
export const fullPillRadius = [99, 99, 99, 99] as const

export const life = Math.floor(75 * 365.25)
export const today = new Date().getDay()
export const age = Math.floor((31 * 365.25 + 6 * 30.5 - 10) / 7) * 7 + today - 1
export const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export type GridMetrics = {
  blockSize: number
  countX: number
  countY: number
  gridHeight: number
  gridLeft: number
  gridTop: number
  gridWidth: number
  viewportHeight: number
  viewportWidth: number
}

export type CellRect = {
  height: number
  width: number
  x: number
  y: number
}

export function hash(n: number) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

export function computeGridMetrics(viewportWidth: number, viewportHeight: number): GridMetrics {
  const gridSizeX = viewportWidth - gridGap
  const gridSizeY = viewportHeight - gridGap
  const blockSize_ =
    (life * Math.sqrt((4 * life * gridSizeX * gridSizeY + (7 * gridSizeY) ** 2) / life ** 2) + 7 * gridSizeY) /
    2 /
    life
  const countX = Math.max(7, Math.floor(gridSizeX / blockSize_ / 7) * 7)
  const countY = Math.ceil(life / countX)
  const blockSize = gridSizeY / countY
  const gridWidth = countX * blockSize
  const gridHeight = countY * blockSize

  return {
    blockSize,
    countX,
    countY,
    gridHeight,
    gridLeft: (viewportWidth - gridWidth) / 2,
    gridTop: (viewportHeight - gridHeight) / 2,
    gridWidth,
    viewportHeight,
    viewportWidth,
  }
}

export function computeCellRect(metrics: GridMetrics, index: number): CellRect {
  const row = Math.floor(index / metrics.countX)
  const column = index % metrics.countX
  return {
    height: metrics.blockSize,
    width: metrics.blockSize,
    x: metrics.gridLeft + column * metrics.blockSize,
    y: metrics.gridTop + row * metrics.blockSize,
  }
}

export function computeCellCenter(metrics: GridMetrics, index: number) {
  const cell = computeCellRect(metrics, index)
  return {
    x: cell.x + cell.width / 2,
    y: cell.y + cell.height / 2,
  }
}

export function hitTestDayIndex(metrics: GridMetrics, pointerX: number, pointerY: number) {
  if (
    pointerX < metrics.gridLeft ||
    pointerX >= metrics.gridLeft + metrics.gridWidth ||
    pointerY < metrics.gridTop ||
    pointerY >= metrics.gridTop + metrics.gridHeight
  ) {
    return null
  }

  const column = Math.floor((pointerX - metrics.gridLeft) / metrics.blockSize)
  const row = Math.floor((pointerY - metrics.gridTop) / metrics.blockSize)
  const index = row * metrics.countX + column

  if (index < 0 || index >= life) {
    return null
  }

  return index
}

export function isAgeDay(index: number) {
  return index === age
}

export function isFinalDay(index: number) {
  return index === life - 1
}

export function isClickableDay(index: number) {
  return !isAgeDay(index) && !isFinalDay(index)
}

export function currentWeekStartFor(index: number) {
  return Math.floor(index / 7) * 7
}

export function goalDotHue(index: number) {
  return 18 + Math.round(hash(index) * 24)
}
