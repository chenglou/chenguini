const roundDir = new URL('../', import.meta.url)
const outDir = new URL('../.test-dist/', import.meta.url)

await Bun.build({
  entrypoints: [new URL('../index.ts', import.meta.url).pathname],
  outdir: outDir.pathname,
  target: 'browser',
  format: 'esm',
  splitting: false,
  naming: 'app.js',
})

const htmlTemplate = await Bun.file(new URL('../index.html', import.meta.url)).text()
const servedHtml = htmlTemplate.replace('./index.ts', '/app.js')

const server = Bun.serve({
  port: 4313,
  idleTimeout: 255,
  routes: {
    '/__health': new Response('ok'),
  },
  fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(servedHtml, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }

    if (url.pathname === '/app.js') {
      return new Response(Bun.file(new URL('./app.js', outDir)), {
        headers: { 'content-type': 'text/javascript; charset=utf-8' },
      })
    }

    return new Response('Not found', { status: 404 })
  },
})

console.log(`browser test server ready on ${server.url}`)

await new Promise(() => {})
