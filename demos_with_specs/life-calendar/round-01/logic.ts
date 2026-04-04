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

export function hash(n: number) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

export function computeGridMetrics(_viewportWidth: number, _viewportHeight: number): GridMetrics {
  throw new Error('computeGridMetrics() is not implemented yet')
}

export function dayRectForIndex(_dayIndex: number, _metrics: GridMetrics) {
  throw new Error('dayRectForIndex() is not implemented yet')
}

export function hitTestDayIndex(_pointerX: number, _pointerY: number, _metrics: GridMetrics) {
  throw new Error('hitTestDayIndex() is not implemented yet')
}
