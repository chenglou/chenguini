export function keyboardSelect(
    d: Array<{ selected: boolean }>,
    pressedUp: boolean,
    shift: boolean,
    latestSelected: number | null
): number;

export function clickSelect(
    d: Array<{ selected: boolean }>,
    clickedRow: number,
    pivot: number | null,
    latestSelected: number | null,
    meta: boolean,
    shift: boolean
): {
    pivot: number;
    latestSelected: number;
};
