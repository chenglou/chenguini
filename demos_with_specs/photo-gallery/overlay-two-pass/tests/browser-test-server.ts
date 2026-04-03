import { resolve } from 'node:path'

export function startTestServer(rootDir: string) {
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname
      const filePath = resolve(rootDir, `.${pathname}`)
      const file = Bun.file(filePath)

      if (await file.exists()) {
        const type = filePath.endsWith('.html')
          ? 'text/html; charset=utf-8'
          : filePath.endsWith('.js')
            ? 'text/javascript; charset=utf-8'
            : filePath.endsWith('.css')
              ? 'text/css; charset=utf-8'
              : 'application/octet-stream'

        return new Response(file, {
          headers: {
            'content-type': type,
            'cache-control': 'no-store',
          },
        })
      }

      return new Response('Not found', { status: 404 })
    },
  })

  return {
    url: `http://${server.hostname}:${server.port}`,
    stop() {
      server.stop()
    },
  }
}
