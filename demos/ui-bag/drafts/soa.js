let performance = require("perf_hooks").performance;

let data = [];
for (let i = 0; i < 999999; i++) {
  data.push({
    name: "Name" + i,
    age: i + 10,
  });
}

let now = performance.now();
let sum = 0;
for (let i = 0; i < data.length; i++) {
  sum += data[i].age;
}
console.log("Sum", sum);
console.log("Iterate over array-of-structures", performance.now() - now);

// ======

let data2 = { name: [], age: [] };
for (let i = 0; i < 999999; i++) {
  data2.name.push("Name" + i);
  data2.age.push(i + 10);
}

let now2 = performance.now();
let sum2 = 0;
for (let i = 0; i < data2.age.length; i++) {
  sum2 += data2.age[i];
}
console.log("Sum", sum2);
console.log("Iterate over structure-of-arrays", performance.now() - now2);
