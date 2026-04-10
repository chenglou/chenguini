import {chromium} from 'playwright'

const baseUrl = process.env['PHOTO_GALLERY_BASE_URL'] ?? 'http://127.0.0.1:3000/photo-gallery'
const requestId = `resize-${Date.now()}`

const miniatureWatermelonId = 'd228330c-7364-497b-994f-a37467ae436a/0_0'
const octopusId = '32e02d27-a98a-4ef0-a159-368edec4e632/0_1'

const scenarios = [
  {
    name: 'five_to_five_same_cols',
    startWidth: 1400,
    endWidth: 1350,
    height: 1000,
    trackedIds: [miniatureWatermelonId, octopusId],
    sampleTimesMs: [16, 64, 128],
  },
  {
    name: 'six_to_five_first_row',
    startWidth: 1490,
    endWidth: 1480,
    height: 1000,
    trackedKind: 'firstRow',
    sampleTimesMs: [16, 64, 128],
  },
  {
    name: 'four_to_three_anchor_octopus',
    startWidth: 1010,
    endWidth: 990,
    height: 1000,
    anchorId: octopusId,
    trackedIds: [miniatureWatermelonId, octopusId],
    scrollY: 'anchor',
    sampleTimesMs: [16, 64, 128],
  },
]

const browser = await chromium.launch({headless: true})
const page = await browser.newPage({viewport: {width: 1600, height: 1000}})

try {
  const url = new URL(baseUrl)
  url.searchParams.set('verify', 'resize')
  url.searchParams.set('requestId', requestId)
  await page.goto(url.toString(), {waitUntil: 'networkidle'})
  const report = await page.evaluate(async scenariosArg => {
    const api = window.__photoGalleryVerify
    if (api == null) throw new Error('window.__photoGalleryVerify is missing')
    return await api.runBatch(scenariosArg)
  }, scenarios)
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser.close()
}
