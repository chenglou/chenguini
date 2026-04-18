// Pure swap and stack geometry for draggable-cards.
// The demo imports it.

export const rowSizeX = 320
export const windowPaddingTop = 50

/** @fit
 * result == (container - containee) / 2
 */
export function center(containee: number, container: number) {
  return (container - containee) / 2
}

export function shouldSwapUp(pointerY: number, neighborDestY: number, neighborSizeY: number) {
  return pointerY < neighborDestY + neighborSizeY / 2
}

export function shouldSwapDown(pointerY: number, neighborDestY: number, neighborSizeY: number) {
  return pointerY > neighborDestY + neighborSizeY / 2
}

/** @fit
 * given rowSizes.length: int 0..100
 * given rowSizes[]: 0..1000
 * given paddingTop: 0..1000
 * result.length == rowSizes.length
 */
export function stackLayout(rowSizes: number[], paddingTop: number): number[] {
  const result: number[] = []
  let top = paddingTop
  for (const rowSize of rowSizes) {
    result.push(top)
    top += rowSize
  }
  return result
}
