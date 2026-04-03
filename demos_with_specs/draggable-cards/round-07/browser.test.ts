import { expect, test } from 'bun:test'
import { runScenario } from './browserTestUtils'

test('scripted drag reorders the list live while dragging', async () => {
  const report = await runScenario('swap-down')

  expect(report.phase).toBe('ready')
  expect(report.swapHappened).toBe(true)
  expect(report.orderedIds).toEqual([0, 2, 1, 3, 4])
  expect(report.draggedId).toBe(1)
  expect(report.lastDraggedId).toBeNull()
})

test('released card stays visually above the others while settling', async () => {
  const report = await runScenario('release-depth')

  expect(report.phase).toBe('ready')
  expect(report.draggedId).toBeNull()
  expect(report.lastDraggedId).toBe(1)
  expect(report.orderedIds).toEqual([0, 2, 1, 3, 4])
  expect(report.topVisualCardId).toBe(1)
  expect(report.releasedCardStillElevated).toBe(true)
  expect(report.releasedCardIsSettling).toBe(true)
})
