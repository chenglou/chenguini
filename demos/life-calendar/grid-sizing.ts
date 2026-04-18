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
 * given px: number[0, 1000000]
 * given py: number[0, 1000000]
 * given blockSize: number[1, 1000]
 * given countX: int[1, 1000]
 * given px < countX * blockSize
 * result: int[0, 1001000000]
 * result >= 0
 */
function hitIndexInside(px: number, py: number, blockSize: number, countX: number) {
  return Math.floor(py / blockSize) * countX + Math.floor(px / blockSize)
}

export function hitTest(blockSize: number, countX: number, _countY: number, gridLeft: number, gridTop: number, gridFinalSizeX: number, gridFinalSizeY: number, pointer: {x: number; y: number}) {
  const px = pointer.x - gridLeft
  const py = pointer.y - gridTop
  if (px < 0 || px >= gridFinalSizeX || py < 0 || py >= gridFinalSizeY) return null
  return hitIndexInside(px, py, blockSize, countX)
}
