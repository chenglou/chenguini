let performance = require("perf_hooks").performance;

let data = [];
for (let i = 0; i < 999999; i++) {
  data.push(Math.random() < 0.5);
}

let dummyRun; // warm things up
for (let i = 0; i < data.length; i++) dummyRun = data[i]
console.log(dummyRun)

let now = performance.now();
let hasTrue = false;
for (let i = 0; i < data.length; i++) {
  if (data[i]) {
    hasTrue = true;
  }
}
console.log("hasTrue", hasTrue);
console.log("loop 1:", performance.now() - now);

let now2 = performance.now();
let hasTrue2 = false;
for (let i = 0; i < data.length; i++) {
  hasTrue2 = hasTrue2 || data[i];
}
console.log("hasTrue2", hasTrue2);
console.log("loop 2:", performance.now() - now2);
