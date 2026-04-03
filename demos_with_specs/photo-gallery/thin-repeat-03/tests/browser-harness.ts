import {chromium, type Browser, type Page} from 'playwright'

const demoDir = '/Users/chenglou/github/vibescript/demos_with_specs/photo-gallery/thin-repeat-03'

const loopbackHosts = ['127.0.0.1', 'localhost', '[::1]'] as const

export type ScenarioReadyReport = {
  phase: 'ready'
  requestId: string
  scenario: string
  hash: string
  mode: 'grid' | 'line'
  focusedId: string | null
  selectedText: string | null
  mountedCount: number
  totalCount: number
  restoreGap: number | null
  initialFocusedId: string | null
  nextFocusedId: string | null
  focusedRowTop: number | null
  message?: string
}

type ScenarioReport =
  | {phase: 'loading' | 'running'; requestId: string; scenario: string}
  | ({phase: 'error'; requestId: string; scenario: string; message: string})
  | ScenarioReadyReport

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({headless: true})
}

export async function startDemoServer() {
  const port = 4300 + Math.floor(Math.random() * 400)
  const server = Bun.spawn(['bun', '--port', `${port}`, '--no-hmr', './index.html'], {
    cwd: demoDir,
    stdout: 'ignore',
    stderr: 'pipe',
  })
  const baseUrl = await probeBaseUrl(port, server)

  return {
    baseUrl,
    async stop() {
      server.kill()
      await server.exited
    },
  }
}

export async function runScenario(page: Page, url: string, requestId: string): Promise<ScenarioReadyReport> {
  await page.goto(url)

  const timeoutAt = Date.now() + 30_000
  while (Date.now() < timeoutAt) {
    const raw = await page.evaluate(() => document.getElementById('scenario-report')?.textContent ?? '')
    if (raw !== '') {
      const report = JSON.parse(raw) as ScenarioReport
      if (report.requestId === requestId) {
        switch (report.phase) {
          case 'loading':
          case 'running':
            break
          case 'error':
            throw new Error(report.message)
          case 'ready':
            return report
        }
      }
    }
    await page.waitForTimeout(50)
  }

  throw new Error(`Timed out waiting for scenario report: ${requestId}`)
}

async function probeBaseUrl(port: number, server: Bun.Subprocess<'ignore', 'pipe', 'inherit'>) {
  const deadline = Date.now() + 15_000

  while (Date.now() < deadline) {
    const exitCode = server.exitCode
    if (exitCode != null) {
      const stderr = await new Response(server.stderr).text()
      throw new Error(`Demo server exited early with code ${exitCode}:\n${stderr}`)
    }

    for (const host of loopbackHosts) {
      const url = `http://${host}:${port}/index.html`
      try {
        const response = await fetch(url, {signal: AbortSignal.timeout(300)})
        if (response.ok) {
          return `http://${host}:${port}`
        }
      } catch {
        // keep probing the other loopback hosts
      }
    }

    await Bun.sleep(50)
  }

  throw new Error('Timed out waiting for the demo server to respond')
}
