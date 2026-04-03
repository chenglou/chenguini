import { createServer as createHttpServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

async function pickOpenPort() {
  return await new Promise((resolve, reject) => {
    const server = createNetServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address == null || typeof address === 'string') {
        reject(new Error('Expected a numeric port from the temporary server'))
        return
      }
      server.close((error) => {
        if (error != null) {
          reject(error)
          return
        }
        resolve(address.port)
      })
    })
  })
}

async function probeBaseUrl(port) {
  const candidates = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
  ]
  const deadline = Date.now() + 10_000

  while (Date.now() < deadline) {
    for (const baseUrl of candidates) {
      try {
        const response = await fetch(`${baseUrl}/?ping=1`, {
          signal: AbortSignal.timeout(500),
        })
        if (response.ok) {
          return baseUrl
        }
      } catch {
      }
    }
    await delay(100)
  }

  throw new Error(`Timed out waiting for the demo server on port ${port}`)
}

export async function startDemoServer(indexHtmlPath) {
  const port = await pickOpenPort()
  const rootDir = path.dirname(indexHtmlPath)
  const server = createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname
      const filePath = path.join(rootDir, pathname.slice(1))
      if (!filePath.startsWith(rootDir)) {
        response.writeHead(404)
        response.end('Not found')
        return
      }

      const body = await readFile(filePath)
      const contentType =
        pathname.endsWith('.html')
          ? 'text/html; charset=utf-8'
          : pathname.endsWith('.js')
            ? 'text/javascript; charset=utf-8'
            : 'application/octet-stream'

      response.writeHead(200, { 'content-type': contentType })
      response.end(body)
    } catch {
      response.writeHead(404)
      response.end('Not found')
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject)
      resolve()
    })
  })

  const baseUrl = await probeBaseUrl(port)
  return {
    baseUrl,
    async stop() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error != null) {
            reject(error)
            return
          }
          resolve()
        })
      })
    },
  }
}

export async function waitForMatchingReadyReport(page, requestId) {
  const handle = await page.waitForFunction(
    (expectedRequestId) => {
      const prefix = '#report='
      if (!window.location.hash.startsWith(prefix)) {
        return null
      }

      try {
        const report = JSON.parse(decodeURIComponent(window.location.hash.slice(prefix.length)))
        if (report.requestId !== expectedRequestId) {
          return null
        }
        if (report.phase === 'ready' || report.phase === 'error') {
          return report
        }
      } catch {
      }

      return null
    },
    requestId,
    { timeout: 30_000 },
  )

  const report = await handle.jsonValue()
  if (report.phase === 'error') {
    throw new Error(report.message ?? `Scenario ${report.scenario} failed`)
  }
  return report
}
