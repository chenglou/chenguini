import {runGestureFlickStaticVerification} from './static-verifier.ts'

const source = await Bun.file(new URL('../../demos/gesture-flick-snap-target/snap-layout.ts', import.meta.url)).text()
const report = runGestureFlickStaticVerification(source)

console.log(JSON.stringify(report, null, 2))
if (report.phase !== 'ready') process.exitCode = 1
