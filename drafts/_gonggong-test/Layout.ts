import { center, rem } from './MidUI'

const noNav = 625 // TODO (Max): revert to 640px after cheng changes to window.innerWidth instead of document.whatever
export const collapsedNav = 1344
export const tabletBreakPoint = 1024
export const containerInnerMaxSizeX = 1608
// export const inputGapTop = rem(1.3)
export const inputGapBottom = 50
export const inputMinLineHeight = 24 // 16px * 1.5
export const inputMinLineHeightMobile = 21 // 14px * 1.25
export const inputPaddingY = 15 // 14pt padding + 1pt border
export const expandedInputSizeY = 96
export const MobileNavSizeY = 72

export const galleryAndExploreImageDefaultRadius = 2
export const galleryAndExploreImageEdgeRadius = 12

export const mobileLightboxBreakpoint = 864

export type NavAndContainerDesktop = {
  type: 'desktopCollapsedNav' | 'desktopExpandedNav' //| 'tabletCollapsedNav'
  navSizeX: number
  windowGapLeft: number
  navContainerGap: number
  containerSizeX: number
  containerInnerSizeX: number
  containerInnerX: number
  windowGapRight: number
  windowGapTop: number
}
export type NavAndContainer =
  | NavAndContainerDesktop
  | {
      type: 'mobile'
      windowGapLeft: number
      windowGapRight: number
      containerSizeX: number
      containerInnerSizeX: number
      containerInnerX: number
      windowGapTop: number
    }

export function navAndContainer(windowSizeX: number): NavAndContainer {
  const windowGapTop = 20
  if (windowSizeX < noNav) {
    return {
      type: 'mobile',
      windowGapLeft: 16,
      windowGapRight: 16,
      containerSizeX: windowSizeX,
      containerInnerSizeX: windowSizeX - 16 - 16,
      containerInnerX: 16,
      windowGapTop,
    }
  }
  const windowGapLeft = 22
  const windowGapRight = 22 + 16
  if (windowSizeX < collapsedNav) {
    const navContainerGap = windowGapLeft
    const navSizeX = windowGapLeft + 38 + navContainerGap
    const containerSizeX = windowSizeX - navSizeX
    const containerInnerSizeX = Math.min(containerInnerMaxSizeX, containerSizeX - windowGapRight)
    return {
      type: 'desktopCollapsedNav',
      windowGapLeft,
      navSizeX,
      navContainerGap,
      windowGapRight,
      containerSizeX,
      containerInnerSizeX,
      containerInnerX: center(containerInnerSizeX, containerSizeX, 0, windowGapRight),
      windowGapTop,
    }
  }

  // if (windowSizeX < tabletBreakPoint) {
  //   const navContainerGap = windowGapLeft
  //   const navSizeX = windowGapLeft + 38 + navContainerGap
  //   const containerSizeX = windowSizeX - navSizeX
  //   const containerInnerSizeX = Math.min(containerInnerMaxSizeX, containerSizeX - windowGapRight)
  //   return {
  //     type: 'tabletCollapsedNav',
  //     windowGapLeft,
  //     navSizeX,
  //     navContainerGap,
  //     windowGapRight,
  //     containerSizeX,
  //     containerInnerSizeX,
  //     containerInnerX: center(containerInnerSizeX, containerSizeX, 0, windowGapRight),
  //     windowGapTop,
  //   }
  // }

  const navContainerGap = 32
  const navSizeX = windowGapLeft + rem(10) + navContainerGap
  const containerSizeX = windowSizeX - navSizeX
  const containerInnerSizeX = Math.min(containerInnerMaxSizeX, containerSizeX - windowGapRight)
  return {
    type: 'desktopExpandedNav',
    windowGapLeft,
    navSizeX,
    navContainerGap,
    windowGapRight,
    containerSizeX,
    containerInnerSizeX,
    containerInnerX: center(containerInnerSizeX, containerSizeX, 0, windowGapRight),
    windowGapTop,
  }
}
