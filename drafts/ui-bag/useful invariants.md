useful invariants:

- (WRONG 1 S4 C3 C3 S6) pivot will always be at the edge of a range
- (WRONG 1 C3 C2) latestSelected will always be at the edge of a range
- pivot and latestSelected are never null coming in if there's a selected row
- (WRONG, pivot has memory) shift never changes pivot

more info:

- (WRONG) latest selected navigates to edge of range item when shift select row joins 2 ranges
- keyboard unselect pivot: ?
- cmd-unselect latest cause new keyboard latest search
- when cmd-unselecting any, choose new pivot using new pivot alg
- when cmd-unselecting latest row, choose new latest row using latest select v3
  - latest selected not affected if cmd-unselect doesn't touch it
- cmd-selecting a row becomes the new pivot
  - and latest selected

hypothesis:

- shift-arrow is only based on latest selected row
- shift-up when latest is
- shift-arrow doesn't change the pivot
- latest selected should always be selected
- when shift-arrow, latest selected navigates to edge of range when touching new range
