current thought:
how to make scrollTo (called by click -> renderScrollToRow) the same frame when state calculation is later lol
if you want scrollTo on the same frame, you need to:

- calculate the right place to scroll to
- call scrollTo
- then do the rest of the state logic
  but this already can't work bc multiple events might want to scroll to different places
  but we have an exhausive list of events
  now that we're in rAF, we know which events got triggered, but that's too late

for sure: you shouldn't call scrollTo eagerly in an event, unless:

- you have the exhausive list of events and you know both fired

oh shit, we can check stuff in the scroll event! this is after click and keypress
but what happens when calling scrollTo inside the scroll event? answer: defers to the next frame
