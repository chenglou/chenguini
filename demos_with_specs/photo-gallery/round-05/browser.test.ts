import {afterAll, beforeAll, describe, expect, test} from 'bun:test'

import {randomUUID} from 'node:crypto'

const roundDir = '/Users/chenglou/github/vibescript/demos_with_specs/photo-gallery/round-05'
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const port = 34803
const baseUrl = `http://localhost:${port}`

let serverProcess: Bun.Subprocess | null = null

type ScenarioReport = {
  status: 'ok' | 'error'
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  details?: Record<string, unknown>
  message?: string
}

beforeAll(async () => {
  serverProcess = Bun.spawn(['bun', '--port', `${port}`, '--no-hmr', `${roundDir}/index.html`], {
    cwd: roundDir,
    stdout: 'ignore',
    stderr: 'pipe',
  })

  const startedAt = Date.now()
  while (Date.now() - startedAt < 10_000) {
    try {
      const response = await fetch(`${baseUrl}/`)
      if (response.ok) return
    } catch {
      // Keep probing until the page server is up.
    }
    await Bun.sleep(100)
  }

  const stderr = serverProcess.stderr ? await new Response(serverProcess.stderr).text() : ''
  throw new Error(`Timed out starting page server.\n${stderr}`)
})

afterAll(async () => {
  serverProcess?.kill()
  await serverProcess?.exited
})

async function runScenario(scenario: string): Promise<ScenarioReport> {
  const requestId = randomUUID()
  const url = `${baseUrl}/?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`
  const startedAt = Date.now()
  let lastDom = ''

  while (Date.now() - startedAt < 30_000) {
    const proc = Bun.spawn(
      [
        chromePath,
        '--headless=new',
        '--disable-gpu',
        '--allow-file-access-from-files',
        '--run-all-compositor-stages-before-draw',
        '--window-size=1280,900',
        '--virtual-time-budget=4000',
        '--dump-dom',
        url,
      ],
      {
        cwd: roundDir,
        stdout: 'pipe',
        stderr: 'pipe',
      },
    )
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    await proc.exited
    lastDom = stdout || stderr
    const match = stdout.match(/<script id="scenario-report" type="application\/json">([^<]+)<\/script>/)
    if (match == null) {
      await Bun.sleep(200)
      continue
    }
    const report = JSON.parse(match[1]!) as ScenarioReport
    if (report.requestId !== requestId) {
      await Bun.sleep(200)
      continue
    }
    if (report.phase === 'ready' || report.phase === 'error') {
      return report
    }
    await Bun.sleep(200)
  }

  throw new Error(`Scenario ${scenario} timed out.\n${lastDom}`)
}

describe('page-driven semantic flows', () => {
  test('navigation flow updates hash, keyboard navigation, and dismiss', async () => {
    const report = await runScenario('navigation')

    expect(report.status).toBe('ok')
    expect(report.phase).toBe('ready')
    expect(report.details).toMatchObject({
      startedInGrid: true,
      focusedAfterOpen: photoGalleryIdAt(2),
      focusedAfterRight: photoGalleryIdAt(3),
      focusedAfterLeft: photoGalleryIdAt(2),
      focusedAfterEscape: null,
      hashAfterOpen: `#${encodeURIComponent(photoGalleryIdAt(2))}`,
      hashAfterEscape: '',
      scrollLockedWhileFocused: true,
    })
  }, 35_000)

  test('dismissing a deep item scrolls its row back into view with a small peek', async () => {
    const report = await runScenario('dismiss-to-row')

    expect(report.status).toBe('ok')
    expect(report.phase).toBe('ready')
    expect(report.details).toMatchObject({
      focusedIndex: 17,
      rowVisibleAfterDismiss: true,
    })
    const rowOffset = Number(report.details?.rowOffsetAfterDismiss)
    expect(rowOffset).toBeGreaterThanOrEqual(20)
    expect(rowOffset).toBeLessThanOrEqual(80)
  }, 35_000)
})

function photoGalleryIdAt(index: number): string {
  const ids = [
    'd228330c-7364-497b-994f-a37467ae436a/0_0',
    '7b5301ca-ef01-44bd-8bcc-4473c945aaaf/0_0',
    '96ff81dd-fa46-43c0-b681-35b7cd8eb700/0_0',
    '077ddfbf-4f1a-437f-909e-073ec48beae0/0_0',
    'e1d06d80-68ca-4081-9ca2-73f5ba7333cc/0_3',
    '196ff609-69c8-47be-8d92-e9ba9db95e2c/0_3',
    'daa6883b-75ae-4805-9fe8-d394006ca8ca/0_1',
    '0dcaf55a-6ece-42b1-a0b3-eb753d108415/0_3',
    'cfd235ab-89b2-4834-9544-19768f160d2a/0_1',
    'ab740a8e-54af-452a-9b74-7b8cb233c025/0_0',
    'bcf32fdc-6d81-40f0-9063-d67cb402ea2a/0_0',
    'eb145f80-0196-4557-8560-e33637a3a807/0_0',
    '604af437-f76b-4c7f-b778-1a3bf6ad663b/0_0',
    'b6beb80d-b006-45e0-a06d-5e482b541571/0_0',
    '30d33a33-9b5b-4947-b813-4d0c5c2f9939/0_0',
    'fb622e95-814d-4f74-8ac0-04d266c8387d/0_0',
    '733a5b94-3f35-4357-8ef5-645d1a9bb942/0_0',
    '2ca7a0f7-9153-45ce-be2b-1fc89327f61b/0_0',
    '890a8dbb-93f6-4934-a92f-7dde390410e0/0_0',
    '11048abd-2c7e-42de-929b-bad5d810b3a3/0_0',
    'a812ad46-f902-427e-804b-68f5a55f2264/0_0',
    '4481ad84-444d-4761-adb1-15d470f216da/0_0',
    '50be9117-b2f5-482f-b61f-46477ed6184e/0_0',
    '39428453-9b30-4998-a3d6-4668b4e2621f/0_0',
  ]
  return ids[index]!
}
