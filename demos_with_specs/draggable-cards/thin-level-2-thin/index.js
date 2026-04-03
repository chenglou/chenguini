import { createDraggableCardsApp } from './app.js'

const root = document.getElementById('app')
if (!(root instanceof HTMLElement)) {
  throw new Error('Expected #app root element.')
}

const app = createDraggableCardsApp(root)
const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? ''
const requestId = params.get('requestId') ?? ''

if (scenario !== '' && requestId !== '') {
  void app.runScenario(scenario, requestId)
}
