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
] as const

export const gridGap = 8
export const tooltipOffsetX = 110
export const tooltipOffsetY = 36
export const emptyColor = 'hsl(214, 13%, 25%)'
export const filledColor = '#39d353'
export const currentDayColor = '#006d32'
export const finalDayColor = 'red'
export const leftBlockRadius: [number, number, number, number] = [99, 0, 0, 99]
export const rightBlockRadius: [number, number, number, number] = [0, 99, 99, 0]
export const pillRadius: [number, number, number, number] = [99, 99, 99, 99]

export type GridMetrics = {
  viewportWidth: number
  viewportHeight: number
  gridSizeX: number
  gridSizeY: number
  countX: number
  countY: number
  blockSize: number
  canvasWidth: number
  canvasHeight: number
  gridLeft: number
  gridTop: number
}

export type Rect = {
  x: number
  y: number
  width: number
  height: number
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
    (life *
      Math.sqrt(
        (4 * life * gridSizeX * gridSizeY + (7 * gridSizeY) ** 2) / life ** 2,
      ) +
      7 * gridSizeY) /
    2 /
    life
  const countX = Math.floor((gridSizeX / blockSize_) / 7) * 7
  const countY = Math.ceil(life / countX)
  const blockSize = gridSizeY / countY
  const canvasWidth = countX * blockSize
  const canvasHeight = countY * blockSize
  const gridLeft = (viewportWidth - canvasWidth) / 2
  const gridTop = (viewportHeight - canvasHeight) / 2

  return {
    viewportWidth,
    viewportHeight,
    gridSizeX,
    gridSizeY,
    countX,
    countY,
    blockSize,
    canvasWidth,
    canvasHeight,
    gridLeft,
    gridTop,
  }
}

export function dayRectForIndex(dayIndex: number, metrics: GridMetrics): Rect {
  return {
    x: metrics.gridLeft + (dayIndex % metrics.countX) * metrics.blockSize,
    y: metrics.gridTop + Math.floor(dayIndex / metrics.countX) * metrics.blockSize,
    width: metrics.blockSize,
    height: metrics.blockSize,
  }
}

export function hitTestDayIndex(
  pointerX: number,
  pointerY: number,
  metrics: GridMetrics,
): number | null {
  const localX = pointerX - metrics.gridLeft
  const localY = pointerY - metrics.gridTop
  if (
    localX < 0 ||
    localY < 0 ||
    localX >= metrics.canvasWidth ||
    localY >= metrics.canvasHeight
  ) {
    return null
  }

  const dayIndex =
    Math.floor(localY / metrics.blockSize) * metrics.countX +
    Math.floor(localX / metrics.blockSize)
  return dayIndex >= life ? null : dayIndex
}

export function getAgeWeekStart() {
  return Math.floor(age / 7) * 7
}

export function getLifeWeekStart() {
  return Math.floor(life / 7) * 7
}

export function isCollapsedWeekStart(dayIndex: number) {
  if (dayIndex % 7 !== 0) return false
  const weekStart = dayIndex
  if (weekStart < getAgeWeekStart()) return true
  return weekStart > getAgeWeekStart() && weekStart !== getLifeWeekStart()
}

export function getDayRadius(dayIndex: number): [number, number, number, number] | 0 {
  if (dayIndex % 7 === 0) return leftBlockRadius
  if (dayIndex % 7 === 6) return rightBlockRadius
  return 0
}

export function getAgeTooltipText() {
  const years = Math.floor(age / 365.25)
  const month = months[Math.floor((age % 365.25) / 30)] ?? months[0]
  return `You're ${years}, born in ${month}`
}

export function getHoverColor(dayIndex: number) {
  return `hsl(${hash(dayIndex) * 360}, ${hash(dayIndex) * 30 + 70}%, 60%)`
}

export function getCustomDotColor(dayIndex: number) {
  return `hsl(${hash(dayIndex) * 360}, ${hash(dayIndex) * 60 + 30}%, 60%)`
}

export function getPointForDayIndex(dayIndex: number, metrics: GridMetrics) {
  const rect = dayRectForIndex(dayIndex, metrics)
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  }
}
