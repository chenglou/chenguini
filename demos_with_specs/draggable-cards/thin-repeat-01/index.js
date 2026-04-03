import { mountDemo } from './app.js'

const root = document.getElementById('app')
if (!(root instanceof HTMLElement)) {
  throw new Error('Expected #app to exist')
}

mountDemo(root)
