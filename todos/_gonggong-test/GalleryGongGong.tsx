import { ImagineJobData, getJobImageOpinionatedThumbnailUrl, getJobImageUrl, isUpscale } from './stubs'
import {
  Spring,
  XY,
  center,
  fit,
  insideInclusive,
  length,
  lessEqual,
  msPerAnimationStep,
  spring,
  springMostlyDone,
  springStep,
} from './MidUI'

import { navAndContainer } from './Layout'
import { GlobalJobData } from './stubs'
import { ImagineJobActions } from './stubs'
import { Fragment, ReactElement, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Filter } from './stubs'

// TODO: test dragging image in lightbox til edge, then release outside (on mobile)

const jobToPrompt = {
  'ad3733c7-1c59-45a9-94fe-5580490ee910': 'sea king' as const,
  '9060008d-eb56-46dd-9207-6c08a2dc7663': 'woman face left' as const,
  '31b85d22-4f8b-4d64-88e9-895e9db97d62': 'woman face right' as const,
}
const promptToJob = {
  'sea king': 'ad3733c7-1c59-45a9-94fe-5580490ee910',
  'woman face left': '9060008d-eb56-46dd-9207-6c08a2dc7663',
  'woman face right': '31b85d22-4f8b-4d64-88e9-895e9db97d62',
}

type Props = {
  onImageClick: (anchor: Anchor) => void
  jobs: ImagineJobData[] | null
  documentSize: XY
  search: string
  setSearch: (newSearch: string) => void
  filter: Filter
  setFilter: (newFilterFn: (prevFilter: Filter) => Filter) => void
  jobActions: ImagineJobActions
  history: {
    isFetchingNextPage: boolean
    hasNextPage: boolean
    fetchNextPage: () => void
  }
  containerRef: React.MutableRefObject<HTMLDivElement | null>
  inputBarHeight: number
  globalJobData: GlobalJobData
}

type Anchor = { job: ImagineJobData; imageIndex: number }

function globalToContentX(x: number, contentX: number) {
  return x - contentX
}
function globalToContentY(y: number, contentY: number, scrollTop: number) {
  return y - contentY + scrollTop
}

type Animation = { job: ImagineJobData; x: Spring; y: Spring; sizeX: Spring; sizeY: Spring }
function copyAnimation(animating: Animation): Animation {
  // needed for eh, immutability. Sigh
  return {
    job: animating.job,
    x: { ...animating.x },
    y: { ...animating.y },
    sizeX: { ...animating.sizeX },
    sizeY: { ...animating.sizeY },
  }
}

function olderJob(jobs: ImagineJobData[], job: ImagineJobData): number | null {
  let jobIndex = jobs.findIndex(({ id }) => id === job.id)
  return jobIndex === jobs.length - 1 ? null : jobIndex + 1
}

function newerJob(jobs: ImagineJobData[], job: ImagineJobData): number | null {
  let jobIndex = jobs.findIndex(({ id }) => id === job.id)
  return jobIndex === 0 ? null : jobIndex - 1
}

export function GalleryGongGong({
  onImageClick,
  jobs,
  documentSize,
  search,
  setSearch,
  filter,
  setFilter,
  history,
  jobActions,
  containerRef,
  inputBarHeight,
  globalJobData,
}: Props) {
  const [_, setForceUpdate] = useState(0)
  function scheduleRender() {
    setForceUpdate((prev) => prev + 1)
  }

  type State = {
    scrollY: number
    view: 'gallery' | 'lightbox' | 'fullscreen'
    animations: Map<string, Animation>
    anchor: Anchor | null
    lastAnimatedTime: number | null
    pointer: {
      startX: number
      startY: number
      x: number
      y: number
      scrollLock: 'vertical' | 'freeform' | 'notYet'
    } | null
  }
  const state = useRef<State>({
    scrollY: 0,
    view: 'gallery',
    animations: new Map(),
    anchor: null,
    lastAnimatedTime: null,
    pointer: null,
  })

  useLayoutEffect(() => {
    function handleScroll() {
      if (containerRef.current == null) return
      state.current.scrollY = containerRef.current.scrollTop
      scheduleRender()
    }
    containerRef.current?.addEventListener('scroll', handleScroll)
    return () => {
      containerRef.current?.removeEventListener('scroll', handleScroll)
    }
  }, [containerRef])

  type Events = {
    keydown: KeyboardEvent | null
    touchstart: TouchEvent | null
    touchmove: TouchEvent | null
    pointerup: PointerEvent | null
  }
  const events = useRef<Events>({
    keydown: null,
    touchstart: null,
    touchmove: null,
    pointerup: null,
  })
  useEffect(() => {
    function listenerKeydown(e: KeyboardEvent) {
      events.current.keydown = e
      scheduleRender()
    }
    function listenerTouchstart(e: TouchEvent) {
      events.current.touchstart = e
      scheduleRender()
    }
    function listenerTouchmove(e: TouchEvent) {
      if (state.current.view === 'lightbox') e.preventDefault() // if we don't preventDefault (in addition to passive: false), pointerup won't get called
      events.current.touchmove = e
      scheduleRender()
    }
    function listenerPointerup(e: PointerEvent) {
      events.current.pointerup = e
      scheduleRender()
    }
    /*

    Old comment from CreationView.ts:
    pointermove doesn't work on android, pointerdown isn't fired on Safari on the
    first left click after dismissing context menus, mousedown doesn't trigger
    properly on mobile, pointerup isn't triggered when pointer panned (at least on
    iOS), don't forget contextmenu event. Tldr there's no pointer event that works
    cross-browser that can replace mouse & touch events.

    However, on mobile, pointerup is ever so slightly faster than click
    TODO: test if ^ is still true

    New comment from this file:
    pointermove is canceled in lightbox view, touchend is accidentally triggered on scrolling, so we have to use pointerup
    for some reason, touchend also doesn't fire after dismissing lightbox, and waiting til animation finishes
    it's hard to have both pointerup and touchend because latter, the next frame, gets confused about the state of the view
  */
    window.addEventListener('keydown', listenerKeydown)
    window.addEventListener('touchstart', listenerTouchstart, true) // TODO: is this faster or slower than pointerdown?
    window.addEventListener('touchmove', listenerTouchmove, { passive: false }) // needs passive: false. See listenerTouchmove comment
    window.addEventListener('pointerup', listenerPointerup, true)
    return () => {
      window.removeEventListener('keydown', listenerKeydown)
      window.removeEventListener('touchstart', listenerTouchstart, true)
      window.removeEventListener('touchmove', listenerTouchmove)
      window.removeEventListener('pointerup', listenerPointerup, true)
    }
  }, [])
  useEffect(() => {
    events.current.keydown = null
    events.current.touchstart = null
    events.current.touchmove = null
    events.current.pointerup = null
  })

  const layout = navAndContainer(documentSize.x)
  const containerSizeY = documentSize.y
  const realInputBarHeight = inputBarHeight + 72 // TODO: what??
  const containerInnerSizeY = containerSizeY - realInputBarHeight
  const imageAspect = 3 / 4
  const jobsGapX = 8
  const jobsGapY = 8
  const upscaleImageSizeX = layout.containerInnerSizeX / 2 - jobsGapX
  const upscaleImageSizeY = upscaleImageSizeX / imageAspect

  const nonUpscaleImageGapX = 1
  const nonUpscaleImageGapY = 1
  const nonUpscaleImageSizeX = upscaleImageSizeX / 2 - nonUpscaleImageGapX
  const nonUpscaleImageSizeY = nonUpscaleImageSizeX / imageAspect

  const lightboxJobMaxSizeX = layout.containerInnerSizeX - 40
  const lightboxJobMaxSizeY = containerInnerSizeY - layout.windowGapTop - 20 - 20

  const occlusionLenienceGapY = upscaleImageSizeY * 4 // show roughly 2 image row and headers heights' worth of images above and below the viewport

  const nodes: ReactElement[] = []
  let newAnchor = state.current.anchor
  let newView = state.current.view
  let newPointer = state.current.pointer
  let newAnimations: Map<string, Animation> = new Map()

  // used by the animation step later
  const now = performance.now()
  let newLastAnimatedTime = state.current.lastAnimatedTime ?? now
  const steps = Math.floor((now - newLastAnimatedTime) / msPerAnimationStep) // run x spring steps. Decouple physics simulation from framerate!
  newLastAnimatedTime += steps * msPerAnimationStep
  let stillAnimating = false

  const lightboxRemnantNodesInfo: { enqueue_time: number; node: ReactElement }[] = []
  let lightboxAnchorNodes: ReactElement[] = [] // TODO: split newAnimating into map + dedicated anchor animation payload. Don't prematurity unify all transitions into one map, then split anyway...

  if (jobs == null) {
    //
  } else {
    // === process events ===
    // pointer/touch
    if (events.current.pointerup != null) {
      const { pageX, pageY } = events.current.pointerup
      if (insideInclusive(pageX, pageY, layout.containerInnerX, 0, layout.containerInnerSizeX, containerInnerSizeY)) {
        // exclude input bar from hit testing
        const px = globalToContentX(pageX, 0)
        const py = globalToContentY(pageY, 0, state.current.scrollY)

        if (state.current.view === 'gallery') {
          for (let i = 0; i < jobs.length; i++) {
            const job = jobs[i]!
            const x = i % 2 === 0 ? layout.containerInnerX : layout.containerInnerX + upscaleImageSizeX + jobsGapX
            const y = layout.windowGapTop + Math.floor(i / 2) * (upscaleImageSizeY + jobsGapY)

            if (insideInclusive(px, py, x, y, upscaleImageSizeX, upscaleImageSizeY)) {
              newAnchor = { job: job, imageIndex: 0 }
              newView = 'lightbox'
              break
            }
          }
        } else if (state.current.view === 'lightbox') {
          newPointer = null
          if (state.current.pointer == null) {
            // TODO: when would this happen? Two fingers down, one finger up?
            newView = 'gallery'
          } else {
            if (state.current.pointer.scrollLock === 'notYet') {
              newView = 'gallery' // just a regular tap with no drag (right now, even a small drag that fires touchmove makes us go into either locking mode)
            } else if (state.current.pointer.scrollLock === 'freeform') {
              const deltaX = state.current.pointer.x - state.current.pointer.startX
              const deltaY = state.current.pointer.y - state.current.pointer.startY
              if (length(deltaX, deltaY) > 80) {
                newView = 'gallery'
              }
            } else if (state.current.pointer.scrollLock === 'vertical') {
              const deltaY = state.current.pointer.y - state.current.pointer.startY
              if (deltaY < -80) {
                const olderJob_ = olderJob(jobs, state.current.anchor!.job)
                newAnchor = olderJob_ == null ? newAnchor : { job: jobs[olderJob_]!, imageIndex: 0 }
              } else if (deltaY > 80) {
                const newerJob_ = newerJob(jobs, state.current.anchor!.job)
                newAnchor = newerJob_ == null ? newAnchor : { job: jobs[newerJob_]!, imageIndex: 0 }
              }
            }
          }
        }
      }
    }
    if (events.current.touchstart != null) {
      if (state.current.view === 'lightbox') {
        const { pageX, pageY } = events.current.touchstart.touches[0]!
        const px = globalToContentX(pageX, 0)
        const py = globalToContentY(pageY, 0, state.current.scrollY)
        newPointer = { startX: px, startY: py, x: px, y: py, scrollLock: 'notYet' } // TODO: are we handling multiple fingers properly
      }
    }
    if (events.current.touchmove != null) {
      if (state.current.pointer != null) {
        const { pageX, pageY } = events.current.touchmove.touches[0]!
        const px = globalToContentX(pageX, 0)
        const py = globalToContentY(pageY, 0, state.current.scrollY)
        newPointer = { ...state.current.pointer }
        newPointer.x = px
        newPointer.y = py
        if (newPointer.scrollLock === 'notYet') {
          // check whether we're swiping at more than 70 degree
          const deltaX = newPointer.x - newPointer.startX
          const deltaY = newPointer.y - newPointer.startY
          const angle = Math.atan2(Math.abs(deltaY), Math.abs(deltaX))
          const angleDeg = (angle * 180) / Math.PI
          if (angleDeg > 40) {
            newPointer.scrollLock = 'vertical'
            console.log('vertical scroll lock')
          } else {
            newPointer.scrollLock = 'freeform'
            console.log('freeform scroll lock')
          }
        }
      }
    }
    // keys
    if (events.current.keydown != null) {
      const e = events.current.keydown
      if (e.key === 'Escape') newView = 'gallery'
    }

    // === state calculation & animation stepping, fused ===
    const newAnchorOlderJob = jobs == null || newAnchor == null ? null : olderJob(jobs, newAnchor.job)
    const newAnchorNewerJob = jobs == null || newAnchor == null ? null : newerJob(jobs, newAnchor.job)
    // gallery
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i]!
      const ar = job.width / job.height

      const x = i % 2 === 0 ? layout.containerInnerX : layout.containerInnerX + upscaleImageSizeX + jobsGapX
      const y = layout.windowGapTop + Math.floor(i / 2) * (upscaleImageSizeY + jobsGapY)

      const isUpscale_ = isUpscale(job.event_type)
      if (isUpscale_) {
        const lightboxJobSizeX = fit(ar, lightboxJobMaxSizeX, lightboxJobMaxSizeY)
        const lightboxJobSizeY = lightboxJobSizeX / ar

        const lightboxX = center(lightboxJobSizeX, layout.containerSizeX)
        const lightboxY =
          center(lightboxJobSizeY, containerSizeY, layout.windowGapTop + 20, realInputBarHeight + 20) +
          state.current.scrollY
        // while we're looping, add the image animation to the lightbox if we just transitioned into/out of it
        const animation = state.current.animations.get(job.id)
        let newAnimation: Animation | null = null
        if (newAnchor?.job.id === job.id) {
          if (state.current.view === 'gallery' && newView === 'lightbox') {
            // just started transitioning into lightbox
            if (animation) {
              newAnimation = copyAnimation(animation)
            } else {
              newAnimation = {
                job: job,
                // starting positions are the same as the gallery's
                x: spring(x),
                y: spring(y),
                sizeX: spring(upscaleImageSizeX),
                sizeY: spring(upscaleImageSizeY),
              }
            }

            newAnimation.x.dest = lightboxX
            newAnimation.y.dest = lightboxY
            newAnimation.sizeX.dest = lightboxJobSizeX
            newAnimation.sizeY.dest = lightboxJobSizeY
          } else if (state.current.view === 'lightbox' && newView === 'gallery') {
            // transitioning out of lightbox
            if (animation) {
              newAnimation = copyAnimation(animation)
            } else {
              newAnimation = {
                job: job,
                // starting positions are the same as the lightbox's
                x: spring(lightboxX),
                y: spring(lightboxY),
                sizeX: spring(lightboxJobSizeX),
                sizeY: spring(lightboxJobSizeY),
              }
            }

            // we might have been previously dragging the job around in lightbox, so adjust the final position by the pointer's delta. This is the dual of the finalX/Y adjustment code later in lightbox nodes creation
            if (state.current.pointer != null) {
              const deltaX = state.current.pointer.x - state.current.pointer.startX
              const deltaY = state.current.pointer.y - state.current.pointer.startY
              if (state.current.pointer.scrollLock === 'vertical') {
                newAnimation.y.pos += deltaY
              } else {
                newAnimation.x.pos += deltaX
                newAnimation.y.pos += deltaY
              }
            }

            newAnimation.x.dest = x
            newAnimation.y.dest = y
            newAnimation.sizeX.dest = upscaleImageSizeX
            newAnimation.sizeY.dest = upscaleImageSizeY
          } else if (state.current.view === 'lightbox' && newView === 'lightbox') {
            // been transitioning into lightbox, or finished transitioning
            if (animation) {
              newAnimation = copyAnimation(animation)
            } else {
              console.log('yeah--------------')
              // TODO: is this ever hit. Yes it is right now
              newAnimation = {
                job: job,
                // starting positions are the same as the lightbox's
                x: spring(lightboxX),
                y: spring(lightboxY),
                sizeX: spring(lightboxJobSizeX),
                sizeY: spring(lightboxJobSizeY),
              }
            }
            // we might have been previously dragging the job around in lightbox, so adjust the final position by the pointer's delta. This is the dual of the finalX/Y adjustment code later in lightbox nodes creation
            if (state.current.pointer != null && newPointer == null) {
              const deltaX = state.current.pointer.x - state.current.pointer.startX
              const deltaY = state.current.pointer.y - state.current.pointer.startY
              if (state.current.pointer.scrollLock === 'vertical') {
                newAnimation.y.pos += deltaY
              } else {
                newAnimation.x.pos += deltaX
                newAnimation.y.pos += deltaY
              }
            }
            newAnimation.x.dest = lightboxX
            newAnimation.y.dest = lightboxY
            newAnimation.sizeX.dest = lightboxJobSizeX
            newAnimation.sizeY.dest = lightboxJobSizeY
          } else if (state.current.view === 'gallery' && newView === 'gallery') {
            if (animation) newAnimation = copyAnimation(animation) // some unfinished animation from a past transitioning out of lightbox
          } else {
            throw new Error('unreachable')
          }
        } else if (i === newAnchorNewerJob) {
          if (state.current.view === 'lightbox' && newView === 'gallery') {
            // transitioning out of lightbox
            if (animation) {
              newAnimation = copyAnimation(animation)
              // we might have been previously dragging the job around in lightbox, so adjust the final position by the pointer's delta. This is the dual of the finalX/Y adjustment code later in lightbox nodes creation
              if (state.current.pointer != null) {
                const deltaX = state.current.pointer.x - state.current.pointer.startX
                const deltaY = state.current.pointer.y - state.current.pointer.startY
                if (state.current.pointer.scrollLock === 'vertical') {
                  newAnimation.y.pos += deltaY
                } else {
                  newAnimation.x.pos += deltaX
                  newAnimation.y.pos += deltaY
                }
              }

              newAnimation.x.dest = x
              newAnimation.y.dest = y
              newAnimation.sizeX.dest = upscaleImageSizeX
              newAnimation.sizeY.dest = upscaleImageSizeY
            }
          } else if (state.current.view === 'lightbox' && newView === 'lightbox') {
            // been transitioning into lightbox, or finished transitioning
            if (animation) {
              newAnimation = copyAnimation(animation)
            } else if (events.current.touchstart != null || events.current.touchmove != null) {
              newAnimation = {
                job: job,
                // starting positions are the same as the lightbox's
                x: spring(lightboxX),
                y: spring(-containerSizeY),
                sizeX: spring(lightboxJobSizeX),
                sizeY: spring(lightboxJobSizeY),
              }
            }
            // we might have been previously dragging the job around in lightbox, so adjust the final position by the pointer's delta. This is the dual of the finalX/Y adjustment code later in lightbox nodes creation
            if (state.current.pointer != null && newPointer == null && newAnimation != null) {
              const deltaX = state.current.pointer.x - state.current.pointer.startX
              const deltaY = state.current.pointer.y - state.current.pointer.startY
              if (state.current.pointer.scrollLock === 'vertical') {
                newAnimation.y.pos += deltaY
              } else {
                newAnimation.x.pos += deltaX
                newAnimation.y.pos += deltaY
              }
            }
            if (newAnimation != null) {
              newAnimation.x.dest = lightboxX
              newAnimation.y.dest = -containerSizeY
              newAnimation.sizeX.dest = lightboxJobSizeX
              newAnimation.sizeY.dest = lightboxJobSizeY
            }
          } else if (state.current.view === 'gallery' && newView === 'gallery') {
            if (animation) newAnimation = copyAnimation(animation) // some unfinished animation from a past transitioning out of lightbox
          }
        } else if (i === newAnchorOlderJob) {
          if (state.current.view === 'lightbox' && newView === 'gallery') {
            // transitioning out of lightbox
            if (animation) {
              newAnimation = copyAnimation(animation)
              // we might have been previously dragging the job around in lightbox, so adjust the final position by the pointer's delta. This is the dual of the finalX/Y adjustment code later in lightbox nodes creation
              if (state.current.pointer != null) {
                const deltaX = state.current.pointer.x - state.current.pointer.startX
                const deltaY = state.current.pointer.y - state.current.pointer.startY
                if (state.current.pointer.scrollLock === 'vertical') {
                  newAnimation.y.pos += deltaY
                } else {
                  newAnimation.x.pos += deltaX
                  newAnimation.y.pos += deltaY
                }
              }

              newAnimation.x.dest = x
              newAnimation.y.dest = y
              newAnimation.sizeX.dest = upscaleImageSizeX
              newAnimation.sizeY.dest = upscaleImageSizeY
            }
          } else if (state.current.view === 'lightbox' && newView === 'lightbox') {
            // been transitioning into lightbox, or finished transitioning
            if (jobToPrompt[job.id] === 'woman face right') {
              console.log(animation)
            }
            if (animation) {
              newAnimation = copyAnimation(animation)
            } else if (events.current.touchstart != null || events.current.touchmove != null) {
              newAnimation = {
                job: job,
                // starting positions are the same as the lightbox's
                x: spring(lightboxX),
                y: spring(containerSizeY + state.current.scrollY),
                sizeX: spring(lightboxJobSizeX),
                sizeY: spring(lightboxJobSizeY),
              }
            }
            // we might have been previously dragging the job around in lightbox, so adjust the final position by the pointer's delta. This is the dual of the finalX/Y adjustment code later in lightbox nodes creation
            if (state.current.pointer != null && newPointer == null && newAnimation != null) {
              const deltaX = state.current.pointer.x - state.current.pointer.startX
              const deltaY = state.current.pointer.y - state.current.pointer.startY
              if (state.current.pointer.scrollLock === 'vertical') {
                newAnimation.y.pos += deltaY
              } else {
                newAnimation.x.pos += deltaX
                newAnimation.y.pos += deltaY
              }
            }
            if (newAnimation != null) {
              newAnimation.x.dest = lightboxX
              newAnimation.y.dest = containerSizeY + state.current.scrollY
              newAnimation.sizeX.dest = lightboxJobSizeX
              newAnimation.sizeY.dest = lightboxJobSizeY
            }
          } else if (state.current.view === 'gallery' && newView === 'gallery') {
            if (animation) newAnimation = copyAnimation(animation) // some unfinished animation from a past transitioning out of lightbox
          }
        } else {
          // not an anchor, not the prev/next job near the anchor
          if (animation) {
            // some unfinished animation from a past transitioning out of lightbox
            newAnimation = copyAnimation(animation)
          }
        }

        if (newAnimation != null) {
          // TODO: the done check is ideally done after the animation step of the previous render, aka equivalent to checking before stepping once, in this current render. But I forgot why. Maybe to disable animation?
          if (
            springMostlyDone(newAnimation.x) &&
            springMostlyDone(newAnimation.y) &&
            springMostlyDone(newAnimation.sizeX) &&
            springMostlyDone(newAnimation.sizeY)
          ) {
            if (state.current.view === 'lightbox' && 'lightbox' && newAnchor != null) {
              // keep the main anchor job and the prev/next ones in the animating map to preserve some needed states, for rendering the lightbox using the animating map
              if (
                newAnimation.job.id === newAnchor.job.id ||
                (events.current.touchmove != null &&
                  ((newAnchorOlderJob != null && newAnimation.job.id === jobs[newAnchorOlderJob]!.id) ||
                    (newAnchorNewerJob != null && newAnimation.job.id === jobs[newAnchorNewerJob]!.id)))
                // || (newAnchorOlderJob != null && newAnimation.job.id === jobs[newAnchorOlderJob]!.id) ||
                // (newAnchorNewerJob != null && newAnimation.job.id === jobs[newAnchorNewerJob]!.id)
              ) {
                newAnimations.set(job.id, newAnimation)
              } // otherwise don't add it to the new animating map (aka equivalent to removing it from the map of animating jobs)
            }
          } else {
            newAnimations.set(job.id, newAnimation)
            stillAnimating = true
            for (let i = 0; i < steps; i++) {
              springStep(newAnimation.x)
              springStep(newAnimation.y)
              springStep(newAnimation.sizeX)
              springStep(newAnimation.sizeY)
            }
          }
        }

        if (newAnimations.has(job.id)) continue // don't render the job's gallery thumbnail if there's an animated version of us (aka into/out of lightbox)

        if (
          lessEqual(
            -upscaleImageSizeY - occlusionLenienceGapY,
            y - /* to container */ state.current.scrollY,
            containerSizeY + occlusionLenienceGapY
          )
        ) {
          const url = getJobImageOpinionatedThumbnailUrl(job, 0)
          const node = (
            <img
              key={job.id}
              className="absolute object-cover"
              style={{
                transform: `translate3d(${x}px, ${y}px, 0)`,
                width: upscaleImageSizeX,
                height: upscaleImageSizeY,
                borderRadius: 8,
              }}
              src={url}
            />
          )
          nodes.push(node)
        }
      } else {
        for (let j = 0; j < job.images.length; j++) {
          const imageY = y + Math.floor(j / 2) * (nonUpscaleImageSizeY + nonUpscaleImageGapY)
          if (
            lessEqual(
              -nonUpscaleImageSizeY - occlusionLenienceGapY,
              imageY - /* to container */ state.current.scrollY,
              containerSizeY + occlusionLenienceGapY
            )
          ) {
            const imageX = x + (j % 2 === 0 ? 0 : nonUpscaleImageSizeX + nonUpscaleImageGapX)
            const url = getJobImageOpinionatedThumbnailUrl(job, j)
            const node = (
              <img
                key={`${job.id}-${j}`}
                className="absolute object-cover"
                style={{
                  transform: `translate3d(${imageX}px, ${imageY}px, 0)`,
                  width: nonUpscaleImageSizeX,
                  height: nonUpscaleImageSizeY,
                  borderTopLeftRadius: j === 0 ? 8 : 0,
                  borderTopRightRadius: j === 1 ? 8 : 0,
                  borderBottomLeftRadius: j === 2 ? 8 : 0,
                  borderBottomRightRadius: j === 3 ? 8 : 0,
                }}
                src={url}
              />
            )
            nodes.push(node)
          }
        }
      }
    }
    // end gallery

    // lightbox
    newAnimations.forEach((animating) => {
      const { job, x, y, sizeX, sizeY } = animating
      let finalX = x.pos
      let finalY = y.pos
      if (newView === 'lightbox' && animating.job.id === newAnchor?.job.id && newPointer != null) {
        // in lightbox and dragging the job (that might or might not be transitioning). Adjust the final position by the pointer's delta
        // we want the lightbox anchor job to keep animating in, but for the x to also respect the finger position stcikily, without transitions
        const deltaX = newPointer.x - newPointer.startX
        const deltaY = newPointer.y - newPointer.startY
        if (newPointer.scrollLock === 'vertical') {
          finalY += deltaY
        } else {
          finalX += deltaX
          finalY += deltaY
        }
      } else if (
        newView === 'lightbox' &&
        newAnchorOlderJob != null &&
        jobs != null &&
        animating.job.id === jobs[newAnchorOlderJob]!.id &&
        newPointer != null
      ) {
        // transitioning out of lightbox and dragging the job. Adjust the final position by the pointer's delta
        // we want the lightbox anchor job to keep animating out, but for the x to also respect the finger position stcikily, without transitions
        const deltaX = newPointer.x - newPointer.startX
        const deltaY = newPointer.y - newPointer.startY
        if (newPointer.scrollLock === 'vertical') {
          finalY += deltaY
        } else {
          finalX += deltaX
          finalY += deltaY
        }
      } else if (
        newView === 'lightbox' &&
        newAnchorNewerJob != null &&
        jobs != null &&
        animating.job.id === jobs[newAnchorNewerJob]!.id &&
        newPointer != null
      ) {
        // transitioning out of lightbox and dragging the job. Adjust the final position by the pointer's delta
        // we want the lightbox anchor job to keep animating out, but for the x to also respect the finger position stcikily, without transitions
        const deltaX = newPointer.x - newPointer.startX
        const deltaY = newPointer.y - newPointer.startY
        if (newPointer.scrollLock === 'vertical') {
          finalY += deltaY
        } else {
          finalX += deltaX
          finalY += deltaY
        }
      }

      const cachedUrl = getJobImageOpinionatedThumbnailUrl(job, 0)
      const url = getJobImageUrl(job, 0, 'large')
      const node = (
        <Fragment key={job.id}>
          <img
            className="absolute object-cover left-0 top-0"
            style={{
              transform: `translate3d(${finalX}px, ${finalY}px, 0)`,
              width: sizeX.pos,
              height: sizeY.pos,
              borderRadius: 8,
            }}
            src={cachedUrl}
          />
          <img
            className="absolute object-cover left-0 top-0"
            style={{
              transform: `translate3d(${finalX}px, ${finalY}px, 0)`,
              width: sizeX.pos,
              height: sizeY.pos,
              borderRadius: 8,
            }}
            src={url}
          />
        </Fragment>
      )

      if (
        animating.job.id === newAnchor?.job.id ||
        (newAnchorOlderJob != null && animating.job.id === jobs[newAnchorOlderJob]!.id) ||
        (newAnchorNewerJob != null && animating.job.id === jobs[newAnchorNewerJob]!.id)
      ) {
        lightboxAnchorNodes.push(node)
      } else {
        lightboxRemnantNodesInfo.push({ enqueue_time: job.enqueue_time, node })
      }
    })
    lightboxRemnantNodesInfo.sort((a, b) => b.enqueue_time - a.enqueue_time) // sort by enqueue time, so that the most recent jobs are on top depth-wise
  }

  if (stillAnimating) {
    requestAnimationFrame(scheduleRender)
  }
  state.current.lastAnimatedTime = stillAnimating ? newLastAnimatedTime : null

  state.current.anchor = newAnchor
  state.current.view = newView
  state.current.pointer = newPointer
  state.current.animations = newAnimations

  const containeeSizeY = jobs == null ? 0 : Math.ceil(jobs.length / 2) * upscaleImageSizeY
  return (
    <>
      <div
        ref={containerRef}
        className={`absolute ${newView === 'gallery' ? 'overflow-y-scroll' : 'overflow-y-hidden'}`}
        style={{ width: layout.containerSizeX, height: containerSizeY }}
      >
        {/* dummy div to make the container scrollable */}
        <div className="absolute w-1" style={{ height: containeeSizeY }} />
        {nodes}
        {/* === lightbox section === */}
        {/* old jobs transitioning out of lightbox */}
        {lightboxRemnantNodesInfo.map((info) => info.node)}
        {/* lightbox background */}
        <div
          className={`fixed pointer-events-none bg-light-bg dark:bg-dark-bg w-full h-full top-0 left-0 transition-opacity duration-200 ${
            newView === 'lightbox' ? 'opacity-100' : 'opacity-0'
          }`}
        />
        {/* actual lightbox anchor job */}
        {lightboxAnchorNodes}
      </div>
      {/* debug bit to indicate we're still rendering */}
      <div
        className="fixed w-2 h-2 top-0 right-0"
        style={{ backgroundColor: `hsl(${Math.floor(Math.random() * 360)}, 100%, 50%)` }}
      ></div>
    </>
  )
}
