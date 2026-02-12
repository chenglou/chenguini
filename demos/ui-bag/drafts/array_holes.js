let performance = require("perf_hooks").performance;

let now = performance.now();
let data = [];
for (let i = 0; i < 999999; i++) data.push(Math.random());
console.log("Push to empty array", performance.now() - now);

let now2 = performance.now();
let data2 = new Array(999999);
for (let i = 0; i < 999999; i++) data2[i] = Math.random();
console.log("Index setting holey array", performance.now() - now2);

let now3 = performance.now();
let data3 = [];
for (let i = 0; i < 999999; i++) data3[i] = Math.random();
console.log("Index setting empty array", performance.now() - now3);
