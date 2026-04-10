import {chromium} from 'playwright'

const baseUrl = process.env['PHOTO_GALLERY_BASE_URL'] ?? 'http://127.0.0.1:3000/photo-gallery'
const requestId = `layout-laws-${Date.now()}`

const browser = await chromium.launch({headless: true})
const page = await browser.newPage({viewport: {width: 1600, height: 1000}})

try {
  const url = new URL(baseUrl)
  url.searchParams.set('verify', 'layout-laws')
  url.searchParams.set('requestId', requestId)
  await page.goto(url.toString(), {waitUntil: 'networkidle'})
  const report = await page.evaluate(async () => {
    const api = window.__photoGalleryVerify
    if (api?.runLayoutLawSweep == null) throw new Error('window.__photoGalleryVerify.runLayoutLawSweep is missing')
    return await api.runLayoutLawSweep()
  })
  console.log(JSON.stringify(report, null, 2))
  if (report.phase !== 'ready' || report.result?.phase !== 'ready') process.exitCode = 1
} finally {
  await browser.close()
}
