import {existsSync} from 'node:fs'
import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {execFile, spawn} from 'node:child_process'

const SERVER_PORT = 34803
const HOST_CANDIDATES = ['127.0.0.1', 'localhost', '[::1]']
const REPORT_MARKER = '<script id="scenario-report" type="application/json">'
const REPORT_END_MARKER = '</script>'
const SERVER_START_TIMEOUT_MS = 15_000
const SCENARIO_TIMEOUT_MS = 30_000
const POLL_INTERVAL_MS = 250

let serverProcess: ReturnType<typeof spawn> | null = null
let serverBaseUrl = ''

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function execFileText(command: string, args: string[], cwd: string) {
  return new Promise<string>((resolve, reject) => {
    execFile(command, args, {cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024}, (error, stdout) => {
      if (error != null) {
        reject(error)
        return
      }
      resolve(stdout)
    })
  })
}

async function probeServerBaseUrl() {
  for (const host of HOST_CANDIDATES) {
    try {
      await fetch(`http://${host}:${SERVER_PORT}/`, {signal: AbortSignal.timeout(1_000)})
      return `http://${host}:${SERVER_PORT}`
    } catch {}
  }
  throw new Error('Unable to reach the Bun page server on any loopback host')
}

async function findChromeCommand() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error('Unable to find a Chrome-compatible browser for --dump-dom verification')
}

function extractReport(html: string) {
  const start = html.indexOf(REPORT_MARKER)
  if (start === -1) return null
  const afterStart = start + REPORT_MARKER.length
  const end = html.indexOf(REPORT_END_MARKER, afterStart)
  if (end === -1) return null
  return JSON.parse(html.slice(afterStart, end))
}

export async function startScenarioServer(entryHtml: string) {
  if (serverProcess != null) return
  const cwd = entryHtml.slice(0, entryHtml.lastIndexOf('/'))
  serverProcess = spawn(
    'bun',
    ['--port', `${SERVER_PORT}`, '--no-hmr', entryHtml],
    {cwd, stdio: ['ignore', 'pipe', 'pipe']},
  )
  const startedAt = Date.now()
  while (Date.now() - startedAt < SERVER_START_TIMEOUT_MS) {
    try {
      serverBaseUrl = await probeServerBaseUrl()
      return
    } catch {
      if (serverProcess.exitCode != null) {
        throw new Error(`Bun page server exited early with code ${serverProcess.exitCode}`)
      }
      await delay(150)
    }
  }
  throw new Error('Timed out waiting for the Bun page server')
}

export async function stopScenarioServer() {
  if (serverProcess == null) return
  serverProcess.kill('SIGTERM')
  serverProcess = null
  serverBaseUrl = ''
}

export async function runScenario(scenario: string) {
  if (serverProcess == null || serverBaseUrl === '') {
    throw new Error('Scenario server is not running')
  }
  const chrome = await findChromeCommand()
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const dumpDir = await mkdtemp(join(tmpdir(), 'photo-gallery-round-06-'))
  const dumpPath = join(dumpDir, 'report.html')
  const scenarioUrl = `${serverBaseUrl}/?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`
  const startedAt = Date.now()

  try {
    while (Date.now() - startedAt < SCENARIO_TIMEOUT_MS) {
      const html = await execFileText(
        chrome,
        [
          '--headless=new',
          '--disable-gpu',
          '--no-sandbox',
          '--virtual-time-budget=10000',
          '--window-size=1440,1200',
          '--dump-dom',
          scenarioUrl,
        ],
        dumpDir,
      )
      await Bun.write(dumpPath, html)
      const report = extractReport(html)
      if (report != null && report.requestId === requestId) {
        if (report.phase === 'ready') return report
        if (report.phase === 'error') {
          throw new Error(`Scenario ${scenario} failed: ${report.message}`)
        }
      }
      await delay(POLL_INTERVAL_MS)
    }
  } finally {
    await rm(dumpDir, {recursive: true, force: true})
  }

  throw new Error(`Timed out waiting for scenario ${scenario}`)
}
