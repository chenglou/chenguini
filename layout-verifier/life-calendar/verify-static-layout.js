import {runLifeCalendarStaticVerification} from './static-verifier.ts'

const source = await Bun.file(new URL('../../demos/life-calendar/grid-sizing.ts', import.meta.url)).text()
const report = runLifeCalendarStaticVerification(source)

console.log(JSON.stringify(report, null, 2))
if (report.phase !== 'ready') process.exitCode = 1
