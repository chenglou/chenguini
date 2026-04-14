// Pure swap and stack geometry for draggable-cards.
// The demo imports it.

export const rowSizeX = 320
export const windowPaddingTop = 50

export function center(containee: number, container: number) {
  return (container - containee) / 2
}

export function shouldSwapUp(pointerY: number, neighborDestY: number, neighborSizeY: number) {
  return pointerY < neighborDestY + neighborSizeY / 2
}

export function shouldSwapDown(pointerY: number, neighborDestY: number, neighborSizeY: number) {
  return pointerY > neighborDestY + neighborSizeY / 2
}

export function stackLayout(rowSizes: number[], paddingTop: number): number[] {
  const result: number[] = []
  let top = paddingTop
  for (let i = 0; i < rowSizes.length; i++) {
    result.push(top)
    top += rowSizes[i]!
  }
  return result
}
