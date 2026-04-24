// Pure grid sizing and hit testing extracted from the life-calendar demo.
// The demo imports these.

export function gridSizing(life: number, gridSizeX: number, gridSizeY: number) {
  const blockSize_ = (life * Math.sqrt((4 * life * gridSizeX * gridSizeY + (7 * gridSizeY) ** 2) / (life ** 2)) + 7 * gridSizeY) / 2 / life
  const countX = Math.floor((gridSizeX / blockSize_) / 7) * 7
  const countY = Math.ceil(life / countX)
  const blockSize = gridSizeY / countY
  const gridFinalSizeX = countX * blockSize
  const gridFinalSizeY = countY * blockSize
  return {blockSize, countX, countY, gridFinalSizeX, gridFinalSizeY}
}

/** @fit
 * given px < countX * blockSize
 * given py < _countY * blockSize
 * return >= 0
 * return < countX * _countY
 */
function hitIndexInside(
  px: number, // @fit 0..Infinity
  py: number, // @fit 0..Infinity
  blockSize: number, // @fit 1..Infinity
  countX: number, // @fit int 1..Infinity
  _countY: number, // @fit int 1..Infinity
) {
  return Math.floor(py / blockSize) * countX + Math.floor(px / blockSize)
}

export function hitTest(blockSize: number, countX: number, _countY: number, gridLeft: number, gridTop: number, gridFinalSizeX: number, gridFinalSizeY: number, pointer: {x: number; y: number}) {
  const px = pointer.x - gridLeft
  const py = pointer.y - gridTop
  if (px < 0 || px >= gridFinalSizeX || py < 0 || py >= gridFinalSizeY) return null
  return hitIndexInside(px, py, blockSize, countX, _countY)
}
