import { expect, test } from 'bun:test'
import { chromium } from 'playwright'

import { photoGalleryData } from '../data'
import { startGalleryServer } from './browser-server'

type ScenarioReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  message?: string
  hashSequence?: string[]
  scrollTopAfterDismiss?: number
  rowTop?: number
  selectedText?: string
  mode?: string
  mountedGridCount?: number
  totalPhotoCount?: number
}

async function runScenario(
  baseUrl: string,
  scenario: string,
  hash = '',
): Promise<ScenarioReport> {
  const browser = await chromium.launch({args: ['--disable-renderer-backgrounding']})
  const page = await browser.newPage({viewport: {width: 1280, height: 900}})
  const requestId = crypto.randomUUID()
  const url = `${baseUrl}/index.html?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}${hash}`
  await page.goto(url)

  await page.waitForFunction(
    ({requestId}) => {
      const reportNode = document.getElementById('scenario-report')
      if (reportNode == null) return false
      try {
        const report = JSON.parse(reportNode.textContent || '{}') as ScenarioReport
        return report.requestId === requestId && (report.phase === 'ready' || report.phase === 'error')
      } catch {
        return false
      }
    },
    {requestId},
    {timeout: 15_000},
  )

  const report = await page.evaluate(() => {
    const reportNode = document.getElementById('scenario-report')
    if (reportNode == null) throw new Error('Missing scenario report node')
    return JSON.parse(reportNode.textContent || '{}') as ScenarioReport
  })

  await browser.close()
  if (report.phase !== 'ready') {
    throw new Error(report.message ?? `Scenario ${scenario} failed`)
  }
  return report
}

test('browser scenario keeps hash and history in sync', async () => {
  const server = await startGalleryServer()
  try {
    const report = await runScenario(server.baseUrl, 'navigation-hash-sync')
    expect(report.phase).toBe('ready')
    expect(report.hashSequence).toEqual([
      `#${encodeURIComponent(photoGalleryData[0]!.id)}`,
      `#${encodeURIComponent(photoGalleryData[1]!.id)}`,
      '',
      `#${encodeURIComponent(photoGalleryData[1]!.id)}`,
      '',
    ])
  } finally {
    await server.stop()
  }
})

test('browser scenario restores the focused row after dismissing line mode', async () => {
  const server = await startGalleryServer()
  try {
    const report = await runScenario(
      server.baseUrl,
      'dismiss-to-row',
      `#${encodeURIComponent(photoGalleryData[14]!.id)}`,
    )
    expect(report.phase).toBe('ready')
    expect(report.scrollTopAfterDismiss).toBeDefined()
    expect(report.rowTop).toBeDefined()
    expect(Math.abs((report.rowTop || 0) - (report.scrollTopAfterDismiss || 0) - 40)).toBeLessThan(4)
  } finally {
    await server.stop()
  }
})

test('browser scenario selects the full caption without leaving grid mode', async () => {
  const server = await startGalleryServer()
  try {
    const report = await runScenario(server.baseUrl, 'caption-selection')
    expect(report.phase).toBe('ready')
    expect(report.mode).toBe('grid')
    expect(report.selectedText).toBe(photoGalleryData[0]!.prompt)
  } finally {
    await server.stop()
  }
})

test('browser scenario keeps the mounted count below the total photo count', async () => {
  const server = await startGalleryServer()
  try {
    const report = await runScenario(server.baseUrl, 'mounted-count')
    expect(report.phase).toBe('ready')
    expect(report.totalPhotoCount).toBe(photoGalleryData.length)
    expect(report.mountedGridCount).toBeDefined()
    expect(report.mountedGridCount).toBeLessThan(photoGalleryData.length)
  } finally {
    await server.stop()
  }
})
