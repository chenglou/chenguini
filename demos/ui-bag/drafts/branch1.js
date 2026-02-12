let performance = require("perf_hooks").performance;

let data = [];
for (let i = 0; i < 999999; i++) data.push(Math.random());


console.log("Sum over unsorted list:");
var now = performance.now();
var sum = 0;
for (let i = 0; i < data.length; i++) {
  let item = data[i];
  if (item < 0.5) {
    sum += item;
  }
}
console.log("Sum", sum);
console.log("Time", performance.now() - now);

data.sort(); // don't count the time for sorting. That's not the point of this demo

console.log("Sum over sorted list:");
var now = performance.now();
var sum = 0;
for (let i = 0; i < data.length; i++) {
  let item = data[i];
  if (item < 0.5) {
    sum += item;
  }
}
console.log("Sum", sum);
console.log("Time", performance.now() - now);
