import {runDraggableCardsStaticVerification} from './static-verifier.ts'

const source = await Bun.file(new URL('../../demos/draggable-cards/swap-layout.ts', import.meta.url)).text()
const report = runDraggableCardsStaticVerification(source)

console.log(JSON.stringify(report, null, 2))
if (report.phase !== 'ready') process.exitCode = 1
