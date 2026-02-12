# Type-Safe Client-Side Routing Without a Framework

A pattern for building routing that's fully typed, handles browser history correctly, and avoids the traps of routing libraries.

## The Problem with Routing Libraries

Routing libraries try to be one-size-fits-all:
- Some apps need async guards, some don't
- Some need deep component hierarchy access, some don't
- Some need multiple effects on route change, some don't

The result: every app uses a different subset, but pays for the worst-case complexity. You end up fighting the library's abstractions instead of just... parsing URLs.

**Alternative:** Treat routing as a pure parsing problem. LLMs can write the boilerplate. You get full power and full types.

## Core Insight: Route Object vs URL

Most frameworks treat the URL as the source of truth. This is wrong.

**Think of it like JSON:**
- You don't pass JSON strings around your app
- You parse once at the boundary, then work with typed objects
- The route object is your source of truth
- The URL is a lossy serialization for sharing/bookmarking

## When Is URL vs History State the Source of Truth?

This is subtle but important:

| Scenario | Source of Truth | Why |
|----------|-----------------|-----|
| Fresh page load (refresh, shared link, typed URL) | URL | `history.state` is null |
| Normal navigation (clicking links) | Route object | Stored in `history.state` |
| Browser back/forward | History state | `e.state` from popstate event |

The discriminator is whether `history.state` is null.

## Same URL, Different Meaning

Example: A photo modal at `/photo/123` opened from:
- The feed page
- The profile page
- Direct link

The URL is the same, but "close modal" should go to different places. Instagram gets this wrong — refresh a video and you lose your feed position.

**Solution:** Store the full route object (including parent context) in `history.state`. The URL is just for sharing.

```ts
// URL: /photo/123
// But history.state knows the context:
{ type: 'photoModal', id: '123', owner: { type: 'feed', scrollPosition: 1234 } }
{ type: 'photoModal', id: '123', owner: { type: 'profile', userId: 'abc' } }
{ type: 'photoModal', id: '123', owner: null }  // direct navigation
```

## The Types

```ts
// All possible routes in your app — a tagged union
type Route =
  | { type: 'home' }
  | { type: 'feed'; filter: FeedFilter }
  | { type: 'profile'; userId: string; tab: 'posts' | 'likes' | null }
  | { type: 'photoModal'; id: string; owner: PhotoModalOwner | null }
  | { type: 'settings' }
  | { type: 'auth'; callbackUrl: Route | null }
  | { type: '404'; url: string }

// Which routes can "own" (render behind) a photo modal
type PhotoModalOwner =
  | { type: 'feed'; filter: FeedFilter }
  | { type: 'profile'; userId: string; tab: 'posts' | 'likes' | null }
```

Using a tagged union gives you:
- Exhaustive switch statements (TypeScript errors if you miss a case)
- No stringly-typed route matching
- IDE autocomplete for route payloads

## The Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ FRESH PAGE LOAD                                                 │
│                                                                 │
│   URL ──parseUrl──▶ Route ──sanitize──▶ Route ──▶ render        │
│                        ▲                                        │
│                        │                                        │
│              history.state is null,                             │
│              so we parse from URL                               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ NAVIGATE (push)                                                 │
│                                                                 │
│   Route ──sanitize──▶ Route ──┬──▶ setState(route)              │
│                               ├──▶ pushState(route, encode(route))
│                               │         │                       │
│                               │         ▼                       │
│                               │    URL is derived               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ BROWSER BACK/FORWARD                                            │
│                                                                 │
│   popstate event                                                │
│       │                                                         │
│       ▼                                                         │
│   e.state ──▶ Route (skip URL parsing!) ──sanitize──▶ render    │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation

### 1. Parse URL → Route

```ts
function parseUrl(location: URL, historyState: unknown): Route {
  // History state takes precedence — it has full context
  if (historyState != null) {
    return historyState as Route
  }

  // Otherwise parse from URL (fresh navigation)
  const path = location.pathname.split('/').filter(Boolean)
  const params = new URLSearchParams(location.search)

  switch (path[0]) {
    case undefined:
      return { type: 'home' }
    case 'feed':
      return { type: 'feed', filter: parseFilter(params) }
    case 'profile':
      return {
        type: 'profile',
        userId: path[1] ?? '',
        tab: parseTab(params.get('tab'))
      }
    case 'photo':
      return {
        type: 'photoModal',
        id: path[1] ?? '',
        owner: null  // direct navigation, no owner
      }
    case 'auth':
      return {
        type: 'auth',
        callbackUrl: parseCallbackUrl(params.get('callbackUrl'))
      }
    default:
      return { type: '404', url: location.href }
  }
}
```

### 2. Encode Route → URL

```ts
function encode(route: Route): string {
  switch (route.type) {
    case 'home':
      return '/'
    case 'feed':
      return `/feed?filter=${route.filter}`
    case 'profile':
      const tab = route.tab ? `?tab=${route.tab}` : ''
      return `/profile/${route.userId}${tab}`
    case 'photoModal':
      return `/photo/${route.id}`  // owner not encoded — it's in history state
    case 'settings':
      return '/settings'
    case 'auth':
      const callback = route.callbackUrl ? `?callbackUrl=${encodeURIComponent(encode(route.callbackUrl))}` : ''
      return `/auth${callback}`
    case '404':
      return route.url
  }
}
```

### 3. Sanitize/Redirect (Sync!)

```ts
function sanitize(route: Route, user: User | null): Route {
  // Auth guards
  switch (route.type) {
    case 'settings':
      if (user == null) return { type: 'auth', callbackUrl: route }
      return route
    case 'auth':
      // Already logged in? Redirect to callback or home
      if (user != null) {
        return route.callbackUrl ?? { type: 'home' }
      }
      // Clean up circular callbacks
      if (route.callbackUrl?.type === 'auth') {
        return { type: 'auth', callbackUrl: null }
      }
      return route
    case 'photoModal':
      // If modal has owner, validate the owner too
      if (route.owner != null) {
        const sanitizedOwner = sanitize(route.owner, user)
        if (sanitizedOwner.type !== route.owner.type) {
          return sanitizedOwner  // owner redirected, follow it
        }
      }
      return route
    default:
      return route
  }
}
```

**Important:** Keep this synchronous. Async redirects cause flashes of wrong content and are hard to reason about.

### 4. Navigation Functions

```ts
function pushRoute(route: Route) {
  const sanitized = sanitize(route, currentUser)
  setCurrentRoute(sanitized)
  window.history.pushState(sanitized, '', encode(sanitized))
}

function replaceRoute(route: Route) {
  const sanitized = sanitize(route, currentUser)
  setCurrentRoute(sanitized)
  window.history.replaceState(sanitized, '', encode(sanitized))
}

// Listen for back/forward
window.addEventListener('popstate', (e) => {
  const route = parseUrl(window.location, e.state)
  const sanitized = sanitize(route, currentUser)
  setCurrentRoute(sanitized)
})
```

### 5. Type-Safe Link Component

```tsx
function Link({ to, children, ...props }: { to: Route } & AnchorProps) {
  return (
    <a
      href={encode(to)}
      onClick={(e) => {
        // Let browser handle modified clicks (new tab, etc)
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
          return
        }
        e.preventDefault()
        pushRoute(to)
      }}
      {...props}
    >
      {children}
    </a>
  )
}

// Usage — fully typed!
<Link to={{ type: 'profile', userId: '123', tab: 'posts' }}>
  View Profile
</Link>
```

### 6. Route → Component Dispatch

```tsx
function App() {
  const route = useCurrentRoute()

  switch (route.type) {
    case 'home':
      return <HomePage />
    case 'feed':
      return <FeedPage filter={route.filter} />
    case 'profile':
      return <ProfilePage userId={route.userId} tab={route.tab} />
    case 'photoModal':
      // Owner pattern: render owner page with modal overlay
      if (route.owner == null) {
        return <PhotoPage id={route.id} />
      }
      switch (route.owner.type) {
        case 'feed':
          return <FeedPage filter={route.owner.filter} modal={route} />
        case 'profile':
          return <ProfilePage userId={route.owner.userId} tab={route.owner.tab} modal={route} />
      }
    case 'settings':
      return <SettingsPage />
    case 'auth':
      return <AuthPage callbackUrl={route.callbackUrl} />
    case '404':
      return <NotFoundPage url={route.url} />
  }
}
```

## Patterns

### Owner Pattern (for Modals)

When opening a modal from a page, set the owner:

```ts
// Opening photo modal from feed
pushRoute({
  type: 'photoModal',
  id: '123',
  owner: { type: 'feed', filter: currentFilter }
})

// Closing modal — navigate to owner
function closeModal(route: PhotoModalRoute) {
  if (route.owner) {
    pushRoute(route.owner)
  } else {
    pushRoute({ type: 'home' })  // fallback for direct links
  }
}
```

The owner page component renders both itself and the modal overlay. The URL shows `/photo/123`, but history state knows the feed is behind it.

### CallbackUrl Pattern (for Auth)

```ts
// Redirect to auth with return destination
pushRoute({
  type: 'auth',
  callbackUrl: { type: 'settings' }
})

// After successful auth
function onAuthSuccess(route: AuthRoute) {
  pushRoute(route.callbackUrl ?? { type: 'home' })
}
```

CallbackUrl is recursively parsed as a full Route, not a string. This lets you validate it.

### Privacy-Aware Logging

```ts
function encodeForLogging(route: Route): string {
  switch (route.type) {
    case 'profile':
      return '/profile/[userId]'  // don't log actual user IDs
    case 'photoModal':
      return '/photo/[id]'
    default:
      return encode(route)
  }
}
```

## Don'ts

- **Don't parse URLs in components** — centralize in one `parseUrl` function
- **Don't use async redirects** — causes flashes, hard to debug
- **Don't encode everything in URL** — URL is lossy; use history state for full context
- **Don't use string hrefs** — use typed route objects
- **Don't guess modal owners** — always pass owner explicitly when opening

## Gotchas

- Safari private mode hides URL params that look like tracking params

## Why This Works

1. **Type safety** — TypeScript catches missing routes at compile time
2. **No magic** — it's just a switch statement and `pushState`
3. **Full control** — you own the code, not fighting a framework
4. **History works** — back/forward preserve full context via `history.state`
5. **Shareable URLs** — `encode()` produces clean URLs for sharing
6. **LLM-friendly** — the boilerplate is mechanical; let AI write it
