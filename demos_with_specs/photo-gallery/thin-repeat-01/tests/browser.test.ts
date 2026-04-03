import {afterAll, beforeAll, describe, expect, test} from 'bun:test'

import {photoGalleryData} from '../data'
import {formatFocusedHash} from '../model'
import {runScenario, startBrowserHarness, type BrowserHarness} from './browserHarness'

let harness: BrowserHarness | null = null

beforeAll(async () => {
  harness = await startBrowserHarness()
})

afterAll(async () => {
  await harness?.close()
})

describe('browser scenarios', () => {
  test('hash sync opens line mode and clears the hash on dismiss', async () => {
    const target = photoGalleryData[10]!
    const report = await runScenario(harness!, 'hash-sync')

    expect(report.focusedId).toBe(target.id)
    expect(report.hashWhileOpen).toBe(formatFocusedHash(target.id))
    expect(report.modeWhileOpen).toBe('line')
    expect(report.hashAfterDismiss).toBe('')
    expect(report.modeAfterDismiss).toBe('grid')
  })

  test('caption click selects the full caption and stays in grid mode', async () => {
    const target = photoGalleryData[3]!
    const report = await runScenario(harness!, 'caption-selection')

    expect(report.selectedText).toBe(target.prompt)
    expect(report.mode).toBe('grid')
    expect(report.hashAfterDismiss ?? '').toBe('')
  })

  test('dismissing line mode restores the focused row to about 40px below the top', async () => {
    const target = photoGalleryData[15]!
    const report = await runScenario(harness!, 'dismiss-restore')

    expect(report.focusedId).toBe(target.id)
    expect(report.modeAfterDismiss).toBe('grid')
    expect(report.spaceAboveRow).toBeGreaterThanOrEqual(34)
    expect(report.spaceAboveRow).toBeLessThanOrEqual(46)
  })

  test('occlusion mounts fewer cards than the full dataset on a representative scroll position', async () => {
    const report = await runScenario(harness!, 'occlusion')

    expect(report.totalCount).toBe(photoGalleryData.length)
    expect(report.mountedCount).toBeGreaterThan(0)
    expect(report.mountedCount).toBeLessThan(photoGalleryData.length)
    expect(report.visibleRowRange).toHaveLength(2)
    expect(report.visibleRowRange![1]).toBeGreaterThanOrEqual(report.visibleRowRange![0])
  })
})
