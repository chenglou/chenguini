import { afterAll, beforeAll, expect, test } from 'bun:test'
import { runScenarioReport, startHarness, stopHarness, type HarnessHandle } from './browser_test_helpers.ts'

let harness: HarnessHandle

beforeAll(async () => {
  harness = await startHarness()
})

afterAll(async () => {
  await stopHarness(harness)
})

test('scripted drag reorders the cards while dragging', async () => {
  const report = await runScenarioReport(harness, 'swap-down')

  expect(report.phase).toBe('ready')
  expect(report.order).toEqual([1, 2, 0, 3, 4])
  expect(report.swapCount).toBeGreaterThanOrEqual(2)
  expect(report.swapObservedDuringDrag).toBe(true)
  expect(report.draggedId).toBeNull()
  expect(report.lastDraggedId).toBeNull()
  expect(report.zOrderTopToBottom[0]).toBe(4)
})

test('released card stays visually above the stack until it settles', async () => {
  const report = await runScenarioReport(harness, 'release-depth')

  expect(report.phase).toBe('ready')
  expect(report.duringSettle.lastDraggedId).toBe(2)
  expect(report.duringSettle.topCardId).toBe(2)
  expect(report.lastDraggedId).toBeNull()
  expect(report.topCardId).not.toBe(2)
})
