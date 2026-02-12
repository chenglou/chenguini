// Emulate native macOS multiselect behaviors

// returns new latestSelected
function keyboardSelect(d, pressedUp, shift, latestSelected) {
  if (d.length === 0) return null;
  if (d.length === 1 || latestSelected == null) {
    d[0].selected = true;
    return 0; // no selection before? Always select first row
  }

  if (shift) {
    if (pressedUp) {
      if (latestSelected === 0) return 0;

      if (
        d[latestSelected - 1].selected && // we're not at the range's top edge
        (latestSelected + 1 === d.length || !d[latestSelected + 1].selected) // at bottom edge
      ) {
        d[latestSelected].selected = false; // shrink row upward
      }
      let newSelected = latestSelected - 1;
      if (!d[newSelected].selected) {
        // filling a gap, collapsing 2 ranges. March latestSelected all the way til the edge
        d[newSelected].selected = true;
        while (newSelected > 0 && d[newSelected - 1].selected) newSelected--;
      }
      return newSelected;
    } else {
      if (latestSelected === d.length - 1) return latestSelected;

      if (
        d[latestSelected + 1].selected && // we're not at the range's bottom edge
        (latestSelected === 0 || !d[latestSelected - 1].selected) // at top edge
      ) {
        d[latestSelected].selected = false; // shrink row downward
      }
      let newSelected = latestSelected + 1;
      if (!d[newSelected].selected) {
        // filling a gap, collapsing 2 ranges. March latestSelected all the way til the edge
        d[newSelected].selected = true;
        while (newSelected < d.length - 1 && d[newSelected + 1].selected)
          newSelected++;
      }
      return newSelected;
    }
  } else {
    for (let i = 0; i < d.length; i++) d[i].selected = false; // clear all
    let newSelected = pressedUp ? latestSelected - 1 : latestSelected + 1;
    newSelected = Math.max(0, Math.min(d.length - 1, newSelected)); // clamp
    d[newSelected].selected = true;
    return newSelected;
  }
}

// helpers for clickSelect below
function findFirstSelected(d, start, end) {
  for (let i = start; i <= end; i++) if (d[i].selected) return i;
}
function findFirstSelectedDec(d, start) {
  for (let i = start; i >= 0; i--) if (d[i].selected) return i;
}
function findLastSelected(d) {
  for (let i = d.length - 1; i >= 0; i--) if (d[i].selected) return i;
}
function unselectTilGapInc(d, start, end) {
  for (let i = start; i <= end && d[i].selected; i++) d[i].selected = false;
}
function unselectTilGapDec(d, start, end) {
  for (let i = start; i >= end && d[i].selected; i--) d[i].selected = false;
}

function clickSelect(d, clickedRow, pivot, latestSelected, meta, shift) {
  if (d.length === 0) return { pivot: null, latestSelected: null };
  // meta overrides shift if both are pressed
  if (meta) {
    if (!d[clickedRow].selected) {
      d[clickedRow].selected = true;
      return { pivot: clickedRow, latestSelected: clickedRow };
    }
    // so we're unselecting a row. If needed, rearrange pivot and latest selection
    d[clickedRow].selected = false;
    let lastSelected = findLastSelected(d); // note: LAST selected row, not LATEST selected row
    if (lastSelected == null) {
      d[clickedRow].selected = true; // we were the only selected row. Toggle ourselves back on
      return { pivot: clickedRow, latestSelected: clickedRow };
    }
    // search downward for new pivot. Only need to search as far as the last selected row ofc
    let newPivot = findFirstSelected(d, clickedRow + 1, lastSelected);
    if (newPivot == null) newPivot = findFirstSelectedDec(d, clickedRow - 1); // not found below? Search up
    return {
      pivot: newPivot, // newPivot guaranteed non-null since there's >=1 selected rows beside us
      latestSelected:
        // toggled off latestSelected? Use lastSelected as the new latestSelected
        clickedRow === latestSelected ? lastSelected : latestSelected,
    };
  } else if (shift) {
    if (pivot == null) pivot = clickedRow; // no pivot? Make clicked row the pivot
    // Up/down keys don't change pivot but might unselect it. If so, use lowest selected row as new pivot
    let newPivot = d[pivot].selected ? pivot : findLastSelected(d);
    if (clickedRow > newPivot) {
      // clear selected rows on the opposite direction of pivot-to-clickedRow, until a gap
      unselectTilGapDec(d, newPivot - 1, 0);
      // overlapping with another potential range. Clear it
      if (d[clickedRow].selected)
        unselectTilGapInc(d, clickedRow + 1, d.length - 1);
      for (let i = newPivot; i <= clickedRow; i++) d[i].selected = true; // finally, range select
    } else if (clickedRow < newPivot) {
      unselectTilGapInc(d, newPivot + 1, d.length - 1); // same logic than above
      if (d[clickedRow].selected) unselectTilGapDec(d, clickedRow - 1, 0);
      for (let i = clickedRow; i <= newPivot; i++) d[i].selected = true;
    }
    return { pivot: newPivot, latestSelected: clickedRow };
  } else {
    for (let i = 0; i < d.length; i++) d[i].selected = false; // clear all
    d[clickedRow].selected = true;
    return { pivot: clickedRow, latestSelected: clickedRow };
  }
}

// === all test code below
function testClick(
  rawData,
  clickedRow,
  pivot,
  latestSelected,
  meta,
  shift,
  rawEndData,
  endPivot,
  endLatestSelected
) {
  let data = rawData.map((d) => ({ selected: d }));
  let endData = rawEndData.map((d) => ({ selected: d }));
  let { pivot: newPivot, latestSelected: newSelected } = clickSelect(
    data,
    clickedRow,
    pivot,
    latestSelected,
    meta,
    shift
  );
  if (JSON.stringify(data) !== JSON.stringify(endData)) {
    throw new Error(
      `got: ${data.map((d) => d.selected)} but wanted: ${endData.map(
        (d) => d.selected
      )}`
    );
  }
  if (newPivot !== endPivot) {
    throw new Error(`pivot, got: ${newPivot} but wanted: ${endPivot}`);
  }
  if (newSelected !== endLatestSelected) {
    throw new Error(
      `latestSelected, got: ${newSelected} but wanted: ${endLatestSelected}`
    );
  }
}

// TODO: test all edge cases
let t = true;
let f = false;
testClick([f, f, f], 1, null, null, false, false, [f, t, f], 1, 1); // no pivot
testClick([f, t, f], 1, 1, 1, false, false, [f, t, f], 1, 1);
testClick([f, t, t], 1, 1, 1, false, false, [f, t, f], 1, 1);
testClick([t, f, t], 1, 0, 2, false, false, [f, t, f], 1, 1);
testClick([t, f, t], 1, 2, 0, false, false, [f, t, f], 1, 1);
// meta
testClick([f, f, f], 1, null, null, true, false, [f, t, f], 1, 1);
testClick([f, t, f], 1, 1, 1, true, false, [f, t, f], 1, 1);
testClick([f, t, t], 1, 1, 1, true, false, [f, f, t], 2, 2);
testClick([t, f, t], 1, 0, 1, true, false, [t, t, t], 1, 1);
testClick([t, f, t], 2, 0, 2, true, false, [t, f, f], 0, 0);
testClick([t, f, t], 2, 2, 0, true, false, [t, f, f], 0, 0);
testClick([t, f, t, t], 0, 2, 0, true, false, [f, f, t, t], 2, 3);
testClick([t, f, t, t], 0, 2, 3, true, false, [f, f, t, t], 2, 3);
testClick([t, t, f, t], 1, 0, 1, true, false, [t, f, f, t], 3, 3);
testClick([t, t, f, t], 3, 3, 3, true, false, [t, t, f, f], 1, 1);
testClick([f, t, t, t, t], 1, 4, 1, true, false, [f, f, t, t, t], 2, 4);
// shift
testClick([f, t, f], 1, 1, 1, false, true, [f, t, f], 1, 1);
testClick([t, f, f], 1, 0, 0, false, true, [t, t, f], 0, 1);
testClick([f, t, f], 1, 1, 1, false, true, [f, t, f], 1, 1);
testClick([t, t, f], 2, 1, 0, false, true, [f, t, t], 1, 2);
testClick([t, t, f, t, t], 1, 3, 3, false, true, [f, t, t, t, f], 3, 1); // clear surround
testClick([t, t, f, t, t], 2, 3, 3, false, true, [t, t, t, t, f], 3, 2); // clear surround
testClick([t, t, t, t, t], 3, 2, 2, false, true, [f, f, t, t, f], 2, 3); // clear surround
testClick([t, f, t, t, f], 4, 3, 3, false, true, [t, f, f, t, t], 3, 4);

testClick([f, t, f, t, f], 4, 0, 1, false, true, [f, t, f, t, t], 3, 4); // unselected pivot

function testKeyboard(
  rawData,
  pressedUp,
  shift,
  latestSelected,
  rawEndData,
  endLatestSelected
) {
  let data = rawData.map((d) => ({ selected: d }));
  let endData = rawEndData.map((d) => ({ selected: d }));
  let newSelected = keyboardSelect(data, pressedUp, shift, latestSelected);
  if (JSON.stringify(data) !== JSON.stringify(endData)) {
    throw new Error(
      `got: ${data.map((d) => d.selected)} but wanted: ${endData.map(
        (d) => d.selected
      )}`
    );
  }
  if (newSelected !== endLatestSelected) {
    throw new Error(
      `latestSelected, got: ${newSelected} but wanted: ${endLatestSelected}`
    );
  }
}

// press up
testKeyboard([], true, false, null, [], null);
testKeyboard([t], true, false, 0, [t], 0);
testKeyboard([f], true, false, 0, [t], 0);
testKeyboard([t, t], true, false, 0, [t, f], 0);
testKeyboard([t, t], true, false, 1, [t, f], 0);
// press down
testKeyboard([], false, false, null, [], null);
testKeyboard([t], false, false, 0, [t], 0);
testKeyboard([f], false, false, 0, [t], 0);
testKeyboard([t, t], false, false, 0, [f, t], 1);
testKeyboard([t, t], false, false, 1, [f, t], 1);

// shift-up
testKeyboard([f, f], true, true, null, [t, f], 0);
testKeyboard([t, f], true, true, 0, [t, f], 0);
testKeyboard([f, t], true, true, 1, [t, t], 0);
testKeyboard([t, t], true, true, 1, [t, f], 0);
testKeyboard([f, t, f], true, true, 1, [t, t, f], 0);
testKeyboard([t, f, t], true, true, 2, [t, t, t], 0);
testKeyboard([t, t, t], true, true, 2, [t, t, f], 1);
testKeyboard([f, t, t, f, t, f], true, true, 4, [f, t, t, t, t, f], 1);
// shift-down
testKeyboard([f, f], false, true, null, [t, f], 0);
testKeyboard([f, t], false, true, 1, [f, t], 1);
testKeyboard([t, f], false, true, 0, [t, t], 1);
testKeyboard([t, t], false, true, 0, [f, t], 1);
testKeyboard([f, t, f], false, true, 1, [f, t, t], 2);
testKeyboard([t, f, t], false, true, 0, [t, t, t], 2);
testKeyboard([t, t, t], false, true, 0, [f, t, t], 1);
testKeyboard([f, t, f, t, t, f], false, true, 1, [f, t, t, t, t, f], 4);
