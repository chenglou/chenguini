export * from './logic'
export * from './app'

if (typeof document !== 'undefined') {
  bootstrapLifeCalendar()
}

import { bootstrapLifeCalendar } from './app'
