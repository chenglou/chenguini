import { afterAll, describe, expect, test } from 'bun:test'
import {
  computeGridLayout,
  type GridLayoutInput,
  routeLineModePointer,
} from './gallery'
import { photoGalleryData } from './data'
import {
  readScenarioReport,
  runScenarioInBrowser,
  stopStaticServer,
} from './test-browser-harness'

describe('grid layout math', () => {
  test('clamps columns and uses square and portrait sizing heuristics', () => {
    const input = {
      viewportWidth: 1600,
      scrollTop: 0,
      viewportHeight: 900,
      photos: [
        { id: 'landscape', w: 1600, h: 1000, prompt: 'Landscape' },
        { id: 'square', w: 1200, h: 1200, prompt: 'Square' },
        { id: 'portrait', w: 1000, h: 1600, prompt: 'Portrait' },
      ],
    } satisfies GridLayoutInput
    const layout = computeGridLayout(input)

    expect(layout.columnCount).toBe(6)
    expect(Math.round(layout.items[0]?.imageWidth ?? 0)).toBe(233)
    expect(Math.round(layout.items[1]?.imageWidth ?? 0)).toBeLessThan(
      Math.round(layout.items[0]?.imageWidth ?? 0),
    )
    expect(Math.round(layout.items[2]?.imageHeight ?? 0)).toBeGreaterThan(
      Math.round(layout.items[1]?.imageHeight ?? 0),
    )
    expect(layout.items[2]?.height).toBeGreaterThan(layout.items[1]?.height ?? 0)
  })

  test('only mounts visible and near-visible cards', () => {
    const layout = computeGridLayout({
      viewportWidth: 1100,
      scrollTop: 1200,
      viewportHeight: 700,
      photos: photoGalleryData,
    })

    expect(layout.items.length).toBe(photoGalleryData.length)
    expect(layout.visibleItemIds.length).toBeLessThan(photoGalleryData.length)
    expect(layout.visibleItemIds.length).toBeGreaterThan(0)
  })
})

describe('line-mode hit areas', () => {
  test('uses forgiving edge strips before dismissing', () => {
    const input = {
      viewportWidth: 1280,
      focusedIndex: 4,
      photoCount: 10,
    }

    expect(routeLineModePointer({ ...input, pointerX: 20 })).toEqual({
      kind: 'focus',
      index: 3,
    })
    expect(routeLineModePointer({ ...input, pointerX: 1270 })).toEqual({
      kind: 'focus',
      index: 5,
    })
    expect(routeLineModePointer({ ...input, pointerX: 640 })).toEqual({
      kind: 'dismiss',
    })
  })

  test('does not navigate past the edges', () => {
    const input = {
      viewportWidth: 1280,
      photoCount: 10,
    }

    expect(
      routeLineModePointer({ ...input, focusedIndex: 0, pointerX: 10 }),
    ).toEqual({ kind: 'dismiss' })
    expect(
      routeLineModePointer({ ...input, focusedIndex: 9, pointerX: 1275 }),
    ).toEqual({ kind: 'dismiss' })
  })
})

describe('browser scenarios', () => {
  afterAll(async () => {
    await stopStaticServer()
  })

  test('navigation flow keeps hash and scroll lock in sync', async () => {
    const outputPath = await runScenarioInBrowser('navigation-flow')
    const report = await readScenarioReport(outputPath)

    expect(report.phase).toBe('ready')
    expect(report.status).toBe('ok')
    expect(report.scenario).toBe('navigation-flow')
    expect(report.bodyOverflowWhileLineMode).toBe('hidden')
    expect(report.focusSequence).toEqual([
      null,
      photoGalleryData[6]?.id ?? '',
      photoGalleryData[7]?.id ?? '',
      photoGalleryData[6]?.id ?? '',
      null,
    ])
    expect(report.hashSequence.at(1)).toBe(`#${photoGalleryData[6]?.id ?? ''}`)
    expect(report.hashSequence.at(-1)).toBe('')
    expect(report.gridMountedCount).toBeLessThan(photoGalleryData.length)
  })

  test('dismissing line mode scrolls the focused row back into view', async () => {
    const outputPath = await runScenarioInBrowser('dismiss-to-row')
    const report = await readScenarioReport(outputPath)

    expect(report.phase).toBe('ready')
    expect(report.status).toBe('ok')
    expect(report.scenario).toBe('dismiss-to-row')
    expect(report.rowVisibleAfterDismiss).toBe(true)
    expect(report.rowTopAfterDismiss).toBeGreaterThanOrEqual(36)
    expect(report.rowTopAfterDismiss).toBeLessThanOrEqual(120)
  })

  test('caption click selects the full prompt and stays in grid mode', async () => {
    const outputPath = await runScenarioInBrowser('caption-selection')
    const report = await readScenarioReport(outputPath)

    expect(report.phase).toBe('ready')
    expect(report.status).toBe('ok')
    expect(report.scenario).toBe('caption-selection')
    expect(report.selectedText).toBe(photoGalleryData[3]?.prompt ?? '')
    expect(report.focusedId).toBe(null)
    expect(report.hash).toBe('')
  })
})
