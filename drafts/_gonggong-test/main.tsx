import React, { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { GalleryGongGong } from './GalleryGongGong'
import { fakeJobs, defaultFilter } from './stubs'
import type { Filter } from './stubs'

function App() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>(defaultFilter)
  const [documentSize, setDocumentSize] = useState({ x: window.innerWidth, y: window.innerHeight })

  React.useEffect(() => {
    function handleResize() {
      setDocumentSize({ x: window.innerWidth, y: window.innerHeight })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <GalleryGongGong
      onImageClick={(anchor) => console.log('image click', anchor)}
      jobs={fakeJobs}
      documentSize={documentSize}
      search={search}
      setSearch={setSearch}
      filter={filter}
      setFilter={setFilter}
      jobActions={{} as any}
      history={{ isFetchingNextPage: false, hasNextPage: false, fetchNextPage: () => {} }}
      containerRef={containerRef}
      inputBarHeight={0}
      globalJobData={{} as any}
    />
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
