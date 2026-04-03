import {afterAll} from 'bun:test';
import {createServer} from 'node:net';

import {chromium, type Page} from 'playwright';

const DEMO_DIR = '/Users/chenglou/github/vibescript/demos_with_specs/photo-gallery/thin-repeat-02';
const REPORT_SELECTOR = '#scenario-report';
const REPORT_TIMEOUT_MS = 35_000;

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error';
  requestId: string;
  scenario: string;
  message?: string;
  mode?: 'grid' | 'line';
  focusedId?: string | null;
  initialFocusedId?: string | null;
  updatedFocusedId?: string | null;
  hash?: string;
  selectedText?: string;
  restoreGapPx?: number;
  mountedCardCount?: number;
  totalCardCount?: number;
  routeTrace?: string[];
};

let serverPort = 0;
let baseUrl = '';
let serverProcess: Bun.Subprocess | null = null;
let serverStartPromise: Promise<void> | null = null;

function getRandomRequestId() {
  return crypto.randomUUID();
}

async function getAvailablePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address == null || typeof address === 'string') {
        reject(new Error('Failed to acquire a port for the browser test server.'));
        return;
      }
      const {port} = address;
      server.close((closeError) => {
        if (closeError != null) {
          reject(closeError);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function probeLoopbackHost(port: number) {
  for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
    const candidate = `http://${host}:${port}`;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 250);
      try {
        const response = await fetch(candidate, {
          redirect: 'manual',
          signal: controller.signal,
        });
        if (response.ok || response.status === 404) {
          clearTimeout(timeout);
          return candidate;
        }
      } catch {
      } finally {
        clearTimeout(timeout);
      }
      await Bun.sleep(80);
    }
  }
  throw new Error(`The demo server never responded on any loopback host for port ${port}.`);
}

async function ensureServerStarted() {
  if (serverProcess != null && baseUrl !== '') {
    return;
  }
  if (serverStartPromise == null) {
    serverStartPromise = (async () => {
      serverPort = await getAvailablePort();
      serverProcess = Bun.spawn(['bun', '--port', `${serverPort}`, '--no-hmr', 'index.html'], {
        cwd: DEMO_DIR,
        stdout: 'ignore',
        stderr: 'ignore',
      });
      baseUrl = await probeLoopbackHost(serverPort);
    })();
  }
  await serverStartPromise;
}

afterAll(async () => {
  serverProcess?.kill();
});

function buildScenarioUrl(scenario: string, requestId: string, hash = '') {
  const url = new URL(baseUrl);
  url.pathname = '/';
  url.searchParams.set('scenario', scenario);
  url.searchParams.set('requestId', requestId);
  if (hash !== '') {
    url.hash = hash;
  }
  return url.toString();
}

async function waitForReadyReport(page: Page, requestId: string) {
  const deadline = Date.now() + REPORT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const text = await page.locator(REPORT_SELECTOR).textContent();
    if (text != null && text.trim() !== '') {
      const report = JSON.parse(text) as Report;
      if (report.requestId === requestId) {
        if (report.phase === 'error') {
          throw new Error(report.message ?? `Scenario ${report.scenario} failed.`);
        }
        if (report.phase === 'ready') {
          return report;
        }
      }
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`Timed out after ${REPORT_TIMEOUT_MS}ms waiting for a ready report.`);
}

export async function runScenario(options: {
  scenario: string;
  hash?: string;
  viewport?: {width: number; height: number};
}) {
  await ensureServerStarted();
  const requestId = getRandomRequestId();
  const browser = await chromium.launch({headless: true});
  const page = await browser.newPage({
    viewportSize: options.viewport ?? {width: 1_440, height: 900},
  });

  try {
    await page.goto(buildScenarioUrl(options.scenario, requestId, options.hash), {
      waitUntil: 'domcontentloaded',
    });
    return await waitForReadyReport(page, requestId);
  } finally {
    await page.close();
    await browser.close();
  }
}

export {DEMO_DIR, REPORT_TIMEOUT_MS};
