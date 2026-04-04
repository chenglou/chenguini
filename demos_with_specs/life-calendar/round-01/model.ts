export const LIFE_DAYS = Math.floor(75 * 365.25)
export const TODAY = new Date().getDay()
export const AGE_DAY =
  Math.floor((31 * 365.25 + 6 * 30.5 - 10) / 7) * 7 + TODAY - 1
export const MONTHS = [
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

export type GridMetrics = {
  viewportWidth: number
  viewportHeight: number
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

export function hash(_n: number) {
  throw new Error('Not implemented')
}

export function computeGridMetrics(
  _viewportWidth: number,
  _viewportHeight: number,
): GridMetrics {
  throw new Error('Not implemented')
}

export function getDayRect(_metrics: GridMetrics, _index: number): Rect {
  throw new Error('Not implemented')
}

export function hitTestDayIndex(
  _metrics: GridMetrics,
  _pointerX: number,
  _pointerY: number,
) {
  throw new Error('Not implemented')
}
