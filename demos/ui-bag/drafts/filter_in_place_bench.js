// O(n), no alloc
function filterInPlace(arr, cb) {
  let removeCount = 0;
  let i = 0;
  while (i + removeCount < arr.length) {
    arr[i] = arr[i + removeCount];
    cb(arr[i]) ? i++ : removeCount++; // proof of progress per iteration
  }
  arr.length -= removeCount;
}

let a = [1, -2, 3, 2, -3, -9, 7, 4];
filterInPlace(a, (n) => n >= 0);
console.log(a); // [1, 3, 2, 7, 4]

let b = [];
filterInPlace(b, (n) => n >= 0);
console.log(b); // []

let c = [-2, -3, -2];
filterInPlace(c, (n) => n === -3);
console.log(c); // [-3]

let d = [3, 2, 3, 4];
filterInPlace(d, (n) => n !== 2);
console.log(d); // [3, 3, 4]
