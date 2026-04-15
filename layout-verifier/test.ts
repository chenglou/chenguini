import {type LayoutCheckObligation, verifyLayoutFiles} from './check.ts'

const positiveFiles = ['layout-verifier/patterns.ts']
const negativeFiles = ['layout-verifier/negative-patterns.ts']
const negativeExpectedPath = 'layout-verifier/negative-patterns.expected.txt'

const positiveReport = await verifyLayoutFiles(positiveFiles)
if (positiveReport.phase !== 'ready') {
  console.error(JSON.stringify(positiveReport, null, 2))
  process.exitCode = 1
} else {
  console.log(`positive: ${positiveReport.summary.pass} pass, 0 fail, 0 unknown`)
}

const negativeReport = await verifyLayoutFiles(negativeFiles)
const actualNegative = normalizeNegative(negativeReport.obligations)
const expectedNegative = normalizeText(await Bun.file(negativeExpectedPath).text())

if (actualNegative !== expectedNegative) {
  console.error('negative diagnostics drifted')
  console.error('\nExpected:\n' + expectedNegative)
  console.error('Actual:\n' + actualNegative)
  process.exitCode = 1
} else {
  console.log(`negative: ${negativeReport.obligations.filter(obligation => obligation.status !== 'pass').length} expected diagnostics`)
}

function normalizeNegative(obligations: LayoutCheckObligation[]) {
  const lines = obligations
    .filter(obligation => obligation.status !== 'pass')
    .map(obligation => {
      const head = `${obligation.status.toUpperCase()} ${obligation.file}:${obligation.functionName}: ${obligation.text}`
      return obligation.reason == null ? head : `${head}\n  ${obligation.reason}`
    })
  return normalizeText(lines.join('\n'))
}

function normalizeText(text: string) {
  return text.trimEnd() + '\n'
}
