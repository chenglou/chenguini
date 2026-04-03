import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const folder = dirname(fileURLToPath(import.meta.url))
const root = resolve(folder, '..')
const transparentPixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l8QAAAAASUVORK5CYII=',
  'base64',
)

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

function getContentType(filePath) {
  return contentTypes[extname(filePath)] ?? 'text/plain; charset=utf-8'
}

export async function openGalleryPage() {
  const server = createServer(async (request, response) => {
    if (!request.url) {
      response.statusCode = 400
      response.end('Missing request URL')
      return
    }

    const url = new URL(request.url, 'http://127.0.0.1')
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname
    const filePath = resolve(root, `.${pathname}`)

    if (!filePath.startsWith(root)) {
      response.statusCode = 403
      response.end('Forbidden')
      return
    }

    try {
      const body = await readFile(filePath)
      response.setHeader('content-type', getContentType(filePath))
      response.end(body)
    } catch {
      response.statusCode = 404
      response.end('Not found')
    }
  })

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start gallery server')
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve(undefined)
        })
      })
    },
  }
}

export async function routeImageRequests(page) {
  await page.route('**/cdn.midjourney.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: transparentPixel,
    })
  })
}

export async function readReport(page) {
  return await page.evaluate(() => {
    const node = document.getElementById('gallery-report')
    if (!node) {
      throw new Error('Missing gallery report node')
    }
    return JSON.parse(node.textContent || '{}')
  })
}

export async function waitForReadyReport(page, requestId) {
  await page.waitForFunction(
    (expectedRequestId) => {
      const node = document.getElementById('gallery-report')
      if (!node?.textContent) return false
      try {
        const report = JSON.parse(node.textContent)
        return report.phase === 'ready' && report.requestId === expectedRequestId
      } catch {
        return false
      }
    },
    requestId,
  )
}
