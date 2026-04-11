import {expect, test} from 'bun:test'
import {prompt1DLineHeight, prompt2DLineHeight, prompt2DMaxLines, promptPaddingBottom} from '../demos/photo-gallery/prompt-layout'
import {runPhotoGalleryStaticVerification} from './photo-gallery/static-verifier.ts'
import {loadStaticContractOverridesForSourceFile} from './contracts.ts'
import {
  enumerateMutationSites,
  generateMutations,
  runMutationCoverage,
  renderMutationDiffSVG,
  mineInvariants,
} from './mutation-coverage.ts'
import {rangeNumber} from './values.ts'

const sourceFilePath = new URL('../demos/photo-gallery/layout-model.ts', import.meta.url).pathname

test('enumerates mutation sites in photo-gallery layout source', async () => {
  const source = await Bun.file(sourceFilePath).text()
  const sites = enumerateMutationSites(source)

  expect(sites.length).toBeGreaterThan(30)

  const numericSites = sites.filter(s => s.kind === 'numeric-literal')
  expect(numericSites.length).toBeGreaterThan(10)

  const binarySites = sites.filter(s => s.kind === 'binary-operator')
  expect(binarySites.length).toBeGreaterThan(10)

  // Known constants should appear
  expect(numericSites.some(s => s.original === '24')).toBe(true)
  expect(numericSites.some(s => s.original === '220')).toBe(true)
})

test('generates reasonable mutations per site kind', () => {
  const numericMutations = generateMutations({
    kind: 'numeric-literal',
    start: 0, end: 2, original: '24', line: 1, context: 'const gap = 24',
  })
  expect(numericMutations.length).toBeGreaterThanOrEqual(3)

  const opMutations = generateMutations({
    kind: 'binary-operator',
    start: 0, end: 1, original: '+', line: 1, context: 'a + b',
  })
  expect(opMutations.length).toBe(1)
  expect(opMutations[0]!.replacement).toBe('-')
})

test('photo-gallery mutation coverage catches verified functions and reveals blind spots', async () => {
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)

  const report = runMutationCoverage(source, mutatedSource => {
    return runPhotoGalleryStaticVerification(mutatedSource, overrides)
  })

  console.log(`\nMutation coverage: ${report.caught}/${report.caught + report.missed} caught (${((report.caught / (report.caught + report.missed)) * 100).toFixed(1)}%), ${report.crashed} crashed, ${report.totalSites} sites`)

  // The verifier catches mutations in the verified functions
  expect(report.caught).toBeGreaterThan(0)

  // Line 91 mutations (the track-fill formula) should be caught
  const trackFillCaught = report.caughtMutations.filter(r => r.mutation.site.line === 91)
  expect(trackFillCaught.length).toBeGreaterThan(0)
}, 120_000)

test('SVG diff renderer produces valid output for missed mutations', async () => {
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const externalGlobals = {prompt1DLineHeight, prompt2DLineHeight, prompt2DMaxLines, promptPaddingBottom}

  const report = runMutationCoverage(source, mutatedSource => {
    return runPhotoGalleryStaticVerification(mutatedSource, overrides)
  })

  if (report.missedMutations.length > 0) {
    const result = report.missedMutations[0]!
    const mutatedSource = source.slice(0, result.mutation.site.start) + result.mutation.replacement + source.slice(result.mutation.site.end)
    const svg = renderMutationDiffSVG(source, mutatedSource, result.mutation, externalGlobals, overrides)
    expect(svg).toContain('<svg')
    expect(svg).toContain('original')
    expect(svg).toContain('mutated')
  }
}, 120_000)

test('mines invariants from colsBoxMaxSizeXF over viewport widths', async () => {
  const source = await Bun.file(sourceFilePath).text()
  const invariants = mineInvariants(
    source,
    'colsBoxMaxSizeXF',
    [rangeNumber(320, 1600, true)],
    {prompt1DLineHeight, prompt2DLineHeight, prompt2DMaxLines, promptPaddingBottom},
  )

  console.log('\nMined invariants for colsBoxMaxSizeXF([320, 1600]):')
  for (const inv of invariants) console.log(`  ${inv.description}`)

  // Should discover that cols is an integer
  expect(invariants.find(inv => inv.property === 'return.cols' && inv.kind === 'integer')).toBeDefined()
  // Should discover that boxMaxSizeX has bounds
  expect(invariants.find(inv => inv.property === 'return.boxMaxSizeX' && inv.kind === 'bound')).toBeDefined()
})
