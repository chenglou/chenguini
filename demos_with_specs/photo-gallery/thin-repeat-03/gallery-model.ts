export type PhotoData = {
  id: string
  w: number
  h: number
  prompt: string
}

export type PhotoShape = 'landscape' | 'square' | 'portrait'

export type GridLayoutArgs = {
  photos: PhotoData[]
  viewportWidth: number
  sidePadding: number
  topPadding: number
  gap: number
  gridCaptionVisibleHeight: number
  gridCaptionBottomGap: number
  maxColumns: number
  minTargetCardWidth: number
}

export type GridCardLayout = {
  photo: PhotoData
  index: number
  rowIndex: number
  columnIndex: number
  x: number
  y: number
  width: number
  boxHeight: number
  totalHeight: number
}

export type GridRowLayout = {
  index: number
  y: number
  height: number
  startPhotoIndex: number
  endPhotoIndex: number
}

export type GridLayout = {
  columnCount: number
  boxMaxSizeX: number
  totalHeight: number
  cards: GridCardLayout[]
  rows: GridRowLayout[]
}

export type VisibleRowRange = {
  startRowIndex: number
  endRowIndex: number
  mountedCount: number
}

export type LineClickAction = 'previous' | 'next' | 'dismiss'

export const photoGalleryData: PhotoData[] = [
  {id: 'd228330c-7364-497b-994f-a37467ae436a/0_0', w: 2048, h: 2048, prompt: 'Miniature watermelon delicately balanced on fingertip'},
  {id: '7b5301ca-ef01-44bd-8bcc-4473c945aaaf/0_0', w: 1792, h: 2688, prompt: 'Hourglass heart, liquid, grand canyon background, fleeting, ephemerality of time'},
  {id: '96ff81dd-fa46-43c0-b681-35b7cd8eb700/0_0', w: 1792, h: 2688, prompt: 'A phone held extremely close against an xray of a skeleton sitting on a sofa, side by side view'},
  {id: '077ddfbf-4f1a-437f-909e-073ec48beae0/0_0', w: 1344, h: 896, prompt: 'Eclipse in a tiny keychain bottle, dangling around a walking woman\'s purse, dynamic pose, macro photography'},
  {id: 'e1d06d80-68ca-4081-9ca2-73f5ba7333cc/0_3', w: 1536, h: 768, prompt: 'Tetris monuments in lord of the rings setting'},
  {id: '196ff609-69c8-47be-8d92-e9ba9db95e2c/0_3', w: 848, h: 1424, prompt: 'Peaceful prehistoric marine lagaxy life, adventure, bold outlines, bold colors, psychedelic swirls patterns'},
  {id: 'daa6883b-75ae-4805-9fe8-d394006ca8ca/0_1', w: 1024, h: 1024, prompt: 'Apple WWDC promo, dan mumford'},
  {id: '0dcaf55a-6ece-42b1-a0b3-eb753d108415/0_3', w: 1424, h: 848, prompt: 'Everything everywhere all at once, bold outlines'},
  {id: 'cfd235ab-89b2-4834-9544-19768f160d2a/0_1', w: 1344, h: 896, prompt: 'Cute and fluffy marshmallow modern mansion'},
  {id: 'ab740a8e-54af-452a-9b74-7b8cb233c025/0_0', w: 1024, h: 1024, prompt: 'Voronoi 3D printed cup taking roots'},
  {id: 'bcf32fdc-6d81-40f0-9063-d67cb402ea2a/0_0', w: 1344, h: 1024, prompt: 'Marble sculpture of an orange, museum gallery, exhibit'},
  {id: 'eb145f80-0196-4557-8560-e33637a3a807/0_0', w: 864, h: 1728, prompt: 'hourglass heart, liquid, grand canyon background'},
  {id: '604af437-f76b-4c7f-b778-1a3bf6ad663b/0_0', w: 1024, h: 1024, prompt: 'Golden retriever rising from the thick smokes, silhouette, contour'},
  {id: 'b6beb80d-b006-45e0-a06d-5e482b541571/0_0', w: 2304, h: 1536, prompt: 'Jupiter sitting on a chair on Saturn'},
  {id: '30d33a33-9b5b-4947-b813-4d0c5c2f9939/0_0', w: 1536, h: 1024, prompt: 'Chinese mid autumn festival on Neptune, surrealism'},
  {id: 'fb622e95-814d-4f74-8ac0-04d266c8387d/0_0', w: 1664, h: 2432, prompt: 'eclipse in a bottle'},
  {id: '733a5b94-3f35-4357-8ef5-645d1a9bb942/0_0', w: 1024, h: 1536, prompt: 'silk-like silhouette of koi fish, abstract wall paper, volumetric lighting'},
  {id: '2ca7a0f7-9153-45ce-be2b-1fc89327f61b/0_0', w: 2304, h: 1536, prompt: 'futuristic qipao, pink seamless astronaut skirt, sitting cross-legged at a floating space cafe, looking at camera, high angle, depth of field'},
  {id: '890a8dbb-93f6-4934-a92f-7dde390410e0/0_0', w: 1024, h: 1536, prompt: 'website landing page of a company with photos of streets and tiles'},
  {id: '11048abd-2c7e-42de-929b-bad5d810b3a3/0_0', w: 1024, h: 1024, prompt: 'dead tree and castle shaped like the silhouette of a skull, negative space'},
  {id: 'a812ad46-f902-427e-804b-68f5a55f2264/0_0', w: 1024, h: 1024, prompt: 'closed up macrophotography of a bowl of asian dessert'},
  {id: '4481ad84-444d-4761-adb1-15d470f216da/0_0', w: 1536, h: 1536, prompt: 'the cutest little cartoon octopus wearing a cap in a bathtub, she\'s playing with a toy boat, studio lighting, closed-up, hyperrealistic, photoshoot, tilt shift, contrast, intricate details'},
  {id: '50be9117-b2f5-482f-b61f-46477ed6184e/0_0', w: 1024, h: 1536, prompt: 'three-body problem, cinematic'},
  {id: '39428453-9b30-4998-a3d6-4668b4e2621f/0_0', w: 1536, h: 1536, prompt: 'super mario gundam'},
]

export function classifyPhotoShape(photo: PhotoData): PhotoShape {
  if (photo.w > photo.h) return 'landscape'
  if (photo.w < photo.h) return 'portrait'
  return 'square'
}

export function getBoxHeight(boxMaxSizeX: number, shape: PhotoShape) {
  switch (shape) {
    case 'landscape':
      return boxMaxSizeX
    case 'square':
      return boxMaxSizeX * 0.85
    case 'portrait':
      return boxMaxSizeX * 1.05
  }
}

export function buildGridLayout(args: GridLayoutArgs): GridLayout {
  const availableWidth = Math.max(0, args.viewportWidth - args.sidePadding * 2)
  const rawColumnCount = Math.floor((availableWidth + args.gap) / (args.minTargetCardWidth + args.gap))
  const columnCount = Math.max(1, Math.min(args.maxColumns, rawColumnCount))
  const boxMaxSizeX = (availableWidth - args.gap * (columnCount - 1)) / columnCount

  const cards: GridCardLayout[] = []
  const rows: GridRowLayout[] = []
  let rowY = args.topPadding

  for (let rowIndex = 0; rowIndex * columnCount < args.photos.length; rowIndex++) {
    const startPhotoIndex = rowIndex * columnCount
    const endPhotoIndex = Math.min(args.photos.length - 1, startPhotoIndex + columnCount - 1)
    let rowHeight = 0

    for (let photoIndex = startPhotoIndex; photoIndex <= endPhotoIndex; photoIndex++) {
      const photo = args.photos[photoIndex]!
      const boxHeight = getBoxHeight(boxMaxSizeX, classifyPhotoShape(photo))
      const totalHeight = boxHeight + args.gridCaptionVisibleHeight + args.gridCaptionBottomGap
      if (totalHeight > rowHeight) rowHeight = totalHeight

      cards.push({
        photo,
        index: photoIndex,
        rowIndex,
        columnIndex: photoIndex - startPhotoIndex,
        x: args.sidePadding + (photoIndex - startPhotoIndex) * (boxMaxSizeX + args.gap),
        y: rowY,
        width: boxMaxSizeX,
        boxHeight,
        totalHeight,
      })
    }

    rows.push({
      index: rowIndex,
      y: rowY,
      height: rowHeight,
      startPhotoIndex,
      endPhotoIndex,
    })
    rowY += rowHeight + args.gap
  }

  const totalHeight = rows.length === 0 ? args.topPadding : rowY - args.gap

  return {
    columnCount,
    boxMaxSizeX,
    totalHeight,
    cards,
    rows,
  }
}

export function getVisibleRowRange(args: {
  rows: GridRowLayout[]
  scrollY: number
  viewportHeight: number
  overscanRows: number
}): VisibleRowRange {
  if (args.rows.length === 0) {
    return {startRowIndex: 0, endRowIndex: 0, mountedCount: 0}
  }

  const viewportBottom = args.scrollY + args.viewportHeight
  let startRowIndex = 0
  while (
    startRowIndex < args.rows.length - 1 &&
    args.rows[startRowIndex]!.y + args.rows[startRowIndex]!.height < args.scrollY
  ) {
    startRowIndex++
  }

  let endRowIndex = startRowIndex
  while (endRowIndex < args.rows.length - 1 && args.rows[endRowIndex]!.y < viewportBottom) {
    endRowIndex++
  }
  if (args.rows[endRowIndex]!.y >= viewportBottom && endRowIndex > startRowIndex) {
    endRowIndex--
  }

  startRowIndex = Math.max(0, startRowIndex - args.overscanRows)
  endRowIndex = Math.min(args.rows.length - 1, endRowIndex + args.overscanRows)

  let mountedCount = 0
  for (let rowIndex = startRowIndex; rowIndex <= endRowIndex; rowIndex++) {
    const row = args.rows[rowIndex]!
    mountedCount += row.endPhotoIndex - row.startPhotoIndex + 1
  }

  return {startRowIndex, endRowIndex, mountedCount}
}

export function getLineClickAction(args: {
  clientX: number
  viewportWidth: number
  sideStripWidth: number
}): LineClickAction {
  if (args.clientX < args.sideStripWidth) return 'previous'
  if (args.clientX >= args.viewportWidth - args.sideStripWidth) return 'next'
  return 'dismiss'
}

export function getLowResImageUrl(photo: PhotoData) {
  return `https://cdn.midjourney.com/${photo.id}_384_N.webp`
}
