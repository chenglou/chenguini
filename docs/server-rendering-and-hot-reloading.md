We hand-roll our own server rendering (since Bun doesn't provide enough support for our use-cases yet) and hot reloading (which Bun does provide, but it's kinda wonky).

Server rendering is better described by code snippets below.

`build.ts` (only called for prod):
```ts
const result = await build({
  entrypoints: ['src/clientSideEntry.tsx'],
  ...
})

const {jsPath, cssPath} = extractJSAndCSSPathFromResult(result) // we only have one js and css output
await Bun.write('public/out/manifest.json', JSON.stringify({jsPath, cssPath}))
```

`server.ts` (`bun server.ts`, used for both dev and prod. Starts the server):
```tsx
import app from './index.html' // ONLY used for dev mode. Duplicated html from Document.tsx that we use for prod server rendering (described later)

let builtArtifacts
if (isProd) {
  builtArtifacts = await Bun.file('public/out/manifest.json').json()
}

serve({
  routes: {
    // In prod, server-render the full page. In dev, serve index.html directly for hot reloading.
    '/*': isProd
      ? async (req): Promise<Response> => {
          const authedUser = await getAuthUser(req.cookies)
          const initialProps = { authedUser }
          const fullJSX = await Document({
            jsPath: builtArtifacts.jsPath, // Document.tsx below will render a script tag with this path
            cssPath: builtArtifacts.cssPath, // same
            initialProps, // Document.tsx will render a JSON script tag with this initialProps
          })
          const fullHTML = renderToString(fullJSX)
          return new Response(fullHTML)
        }
      : app, // dev: serve index.html directly for Bun's hot reloading

    // Dev-only endpoint: the client fetches initialProps (including auth) via this API
    '/api/dev-initial-props': isProd
      ? new Response('Not found', { status: 404 })
      : async (req) => {
          const initialAuthUser = await getAuthUser(req.cookies)
          return Response.json({ initialAuthUser, urlFromInitialServerRequest: new URL(req.url).searchParams.get('url') })
        }
  }
})
```

`Document.tsx` (prod-only server-rendered HTML shell + OG tags):
```tsx
function Document({ jsPath, cssPath, initialProps, parsedRoute }: Props) {
  const openGraphPreviewTags = await getOpenGraphPreviewTags(parsedRoute, ...) // server side rendering of OG tags
  return (
    <html lang="en">
      {/* ... */}
      {openGraphPreviewTags}
      {/* manually escape the initialProps JSON and put it in the script tag to be read by the JS entrypoint, clientSideEntry.tsx (well, its bundled name) */}
      {/* just like the good old times */}
      <script id="initialProps" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(initialProps).replace(/</g, '\\u003c') }} />
      <div id="root"> {/* this is where the JSX will be hydrated by the client entrypoint */}
        <MyApp
          initialAuthUser={initialProps.initialAuthUser}
        />
      </div>
      <script type="module" src={jsPath} /> {/* recall that this is the bundled client JS entrypoint passed to Document.tsx by server.ts */}
      <link rel="stylesheet" href={cssPath} />
    </html>
  )
}
```

`clientSideEntry.tsx` (entry point to the bundled client JS):
```tsx
if (isProd) {
  const script = document.getElementById('initialProps')
  const initialProps = JSON.parse(script!.textContent!)

  const container = document.getElementById('root')!
  hydrateRoot(
    container,
    <MyApp
      initialAuthUser={initialProps.initialAuthUser}
    />,
  )
} else {
  // In dev, fetch initialProps from a dev-only API endpoint (which does auth server-side)
  const urlFromRequest = `${window.location.pathname}${window.location.search}`
  const response = await fetch(`/api/dev-initial-props?url=${encodeURIComponent(urlFromRequest)}`)
  const initialProps = await response.json()
  const container = document.createElement('div')
  document.body.appendChild(container)
  createRoot(container).render(
    <MyApp
      initialAuthUser={initialProps.initialAuthUser}
    />,
  )
}
```

`index.html` (only used in dev, only for hot reloading. Prod uses `Document.tsx` instead):
```html
<!DOCTYPE html>
<html lang="en">
  <!-- ... -->
  <!-- no OpenGraph tags possible here since this is a static document -->
  <script type="module" src="./clientSideEntry.tsx"></script>
  <!-- no style sheet; added automatically by Bun -->
</html>
```
