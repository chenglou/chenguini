import {describe, expect, test} from 'bun:test'

import {photoGalleryData} from '../data'
import {LINE_ROUTE_HASH_KEY, getFocusedPhotoHash} from '../gallery'
import {runScenario} from './browserTestUtils'

const navigationTarget = photoGalleryData[10]!
const dismissTarget = photoGalleryData[18]!
const captionTarget = photoGalleryData[5]!

type NavigationHashReport = {
  phase: 'ready'
  scenario: 'navigation-hash-sync'
  requestId: string
  focusedId: string | null
  hash: string
  lineModeOpen: boolean
  scrollLockActive: boolean
}

type DismissToRowReport = {
  phase: 'ready'
  scenario: 'dismiss-to-row'
  requestId: string
  hash: string
  lineModeOpen: boolean
  restoredRowInView: boolean
  restoredRowTopGap: number | null
}

type CaptionSelectionReport = {
  phase: 'ready'
  scenario: 'caption-selection'
  requestId: string
  selectedText: string
  lineModeOpen: boolean
  hash: string
}

type GridOcclusionReport = {
  phase: 'ready'
  scenario: 'grid-occlusion'
  requestId: string
  mountedCount: number
  totalCount: number
}

describe('browser scenarios', () => {
  test(
    'keeps hash and focus in sync when an image-area click opens line mode',
    async () => {
      const report = await runScenario<NavigationHashReport>('navigation-hash-sync')

      expect(report.lineModeOpen).toBe(true)
      expect(report.focusedId).toBe(navigationTarget.id)
      expect(report.hash).toBe(getFocusedPhotoHash(navigationTarget.id))
      expect(report.hash.startsWith(`#${LINE_ROUTE_HASH_KEY}=`)).toBe(true)
      expect(report.scrollLockActive).toBe(true)
    },
    30_000,
  )

  test(
    'dismissing a hash-routed focused photo restores its grid row to about forty pixels from the top',
    async () => {
      const report = await runScenario<DismissToRowReport>('dismiss-to-row')

      expect(report.lineModeOpen).toBe(false)
      expect(report.hash).toBe('')
      expect(report.restoredRowInView).toBe(true)
      expect(report.restoredRowTopGap).not.toBeNull()
      expect(Math.abs(report.restoredRowTopGap! - 40)).toBeLessThanOrEqual(8)
      expect(dismissTarget.id.length).toBeGreaterThan(0)
    },
    30_000,
  )

  test(
    'caption clicks select the full prompt and leave the gallery in grid mode',
    async () => {
      const report = await runScenario<CaptionSelectionReport>('caption-selection')

      expect(report.selectedText).toBe(captionTarget.prompt)
      expect(report.lineModeOpen).toBe(false)
      expect(report.hash).toBe('')
    },
    30_000,
  )

  test(
    'grid occlusion mounts fewer cards than the full data set on a representative scroll state',
    async () => {
      const report = await runScenario<GridOcclusionReport>('grid-occlusion')

      expect(report.totalCount).toBe(photoGalleryData.length)
      expect(report.mountedCount).toBeGreaterThan(0)
      expect(report.mountedCount).toBeLessThan(report.totalCount)
    },
    30_000,
  )
})
