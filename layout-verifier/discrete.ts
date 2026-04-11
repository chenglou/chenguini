export type IntegerValueBand = {
  inputMin: number
  inputMax: number
  value: number
}

export function partitionIntegerRangeByConcreteNumberValue(
  inputMin: number,
  inputMax: number,
  getValue: (input: number) => number,
) {
  const partitions: IntegerValueBand[] = []
  let current: IntegerValueBand | null = null

  for (let input = inputMin; input <= inputMax; input++) {
    const value = getValue(input)
    if (current == null || current.value !== value) {
      if (current != null) partitions.push(current)
      current = {inputMin: input, inputMax: input, value}
    } else {
      current.inputMax = input
    }
  }

  if (current != null) partitions.push(current)
  return partitions
}

export function shrinkIntegerRangeByFailingPredicate(
  min: number,
  max: number,
  predicate: (min: number, max: number) => boolean,
) {
  let currentMin = min
  let currentMax = max
  while (currentMin < currentMax) {
    const mid = Math.floor((currentMin + currentMax) / 2)
    if (predicate(currentMin, mid)) {
      currentMax = mid
      continue
    }
    if (predicate(mid + 1, currentMax)) {
      currentMin = mid + 1
      continue
    }
    break
  }
  return {min: currentMin, max: currentMax}
}

export function pickIntegerBandRepresentatives(band: {inputMin: number; inputMax: number}) {
  const mid = Math.floor((band.inputMin + band.inputMax) / 2)
  return [...new Set([band.inputMin, mid, band.inputMax])]
}

export function describeIntegerBands(bands: IntegerValueBand[]) {
  return bands.map(band => `${band.inputMin}-${band.inputMax}:${band.value}`).join(', ')
}
