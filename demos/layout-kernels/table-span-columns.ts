// Extracted from pretex-editor's table column negotiation, but normalized into
// explicit start-column/span inputs instead of parser-specific cell strings.

export type TableCell = {
  startColumn: number
  span: number
  measuredWidth: number
}

export type TableRow = {
  cells: TableCell[]
}

export const TABLE_CELL_PAD = 6

function zeroColumnVector(colCount: number): number[] {
  const colWidths: number[] = []
  for (let column = 0; column < colCount; column++) colWidths.push(0)
  return colWidths
}

function applyCellWidth(colWidths: number[], cell: TableCell, colCount: number): number[] {
  const firstColumn = clamp(0, cell.startColumn, colCount)
  const appliedSpan = Math.max(1, Math.min(cell.span, colCount - firstColumn))
  const perColumnWidth = cell.measuredWidth / appliedSpan
  const nextWidths: number[] = []

  for (let column = 0; column < colCount; column++) {
    const withinSpan = column >= firstColumn && column < firstColumn + appliedSpan
    const previousWidth = colWidths[column]!
    nextWidths.push(withinSpan ? Math.max(previousWidth, perColumnWidth) : previousWidth)
  }

  return nextWidths
}

export function measureTableColumnWidths(rows: TableRow[], colCount: number): number[] {
  let colWidths = zeroColumnVector(colCount)

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]!
    for (let cellIndex = 0; cellIndex < row.cells.length; cellIndex++) {
      const cell = row.cells[cellIndex]!
      colWidths = applyCellWidth(colWidths, cell, colCount)
    }
  }

  return colWidths
}

export function measureTableWidth(colWidths: number[], cellPad = TABLE_CELL_PAD): number {
  let total = 0
  for (let column = 0; column < colWidths.length; column++) {
    total += colWidths[column]! + cellPad * 2
  }
  return total
}

function clamp(min: number, value: number, max: number): number {
  return value > max ? max : value < min ? min : value
}
