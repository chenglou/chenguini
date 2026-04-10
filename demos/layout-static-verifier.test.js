import {expect, test} from 'bun:test'
import {runHNCommentLayoutStaticVerification} from './nicer-hacker-news/comment-layout-static-verifier.ts'
import {runNicerHackerNewsStaticVerification} from './nicer-hacker-news/layout-static-verifier.ts'
import {runPhotoGalleryStaticVerification} from './photo-gallery/layout-static-verifier.ts'

test('photo-gallery static verifier keeps its current proof surface', async () => {
  const source = await Bun.file(new URL('./photo-gallery/layout-model.ts', import.meta.url)).text()
  const report = runPhotoGalleryStaticVerification(source)

  expect(report.phase).toBe('ready')
  expect(report.laws.find(law => law.name === 'getGridLayout row items do not overlap horizontally')?.status).toBe('pass')
  expect(report.laws.find(law => law.name === 'colsBoxMaxSizeXF exactly fills the horizontal track')?.checks).toBe(1281)
})

test('nicer-hacker-news static verifier keeps the row geometry slice ready', async () => {
  const source = await Bun.file(new URL('./nicer-hacker-news/hn-thread-layout.ts', import.meta.url)).text()
  const report = runNicerHackerNewsStaticVerification(source)

  expect(report.phase).toBe('ready')
  expect(report.laws.find(law => law.name === 'layoutHNThreadVisualGeometry keeps comment x and width tied to indent math')?.status).toBe('pass')
  expect(report.laws.find(law => law.name === 'layoutHNThreadVisualGeometry keeps visible-row bookkeeping internally consistent')?.checks).toBe(2)
})

test('nicer-hacker-news comment verifier keeps the text layout kernel ready', async () => {
  const source = await Bun.file(new URL('./nicer-hacker-news/hn-comment-layout.ts', import.meta.url)).text()
  const report = runHNCommentLayoutStaticVerification(source)

  expect(report.phase).toBe('ready')
  expect(report.laws.find(law => law.name === 'layoutPreparedHNCommentDoc keeps fragments inside their line boxes')?.status).toBe('pass')
  expect(report.laws.find(law => law.name === 'layoutPreparedHNCommentDoc derives total height from block heights and block gaps')?.checks).toBe(2)
})
