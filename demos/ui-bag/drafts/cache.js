let performance = require("perf_hooks").performance;

let data = [];
for (let i = 0; i < 999999; i++) {
  data.push(Math.random() < 0.5);
}

function run() {
  let now = performance.now();
  let hasTrue = false;
  for (let i = 0; i < data.length; i++) {
    if (data[i]) hasTrue = true;
  }
  console.log("hasTrue", hasTrue);
  console.log(performance.now() - now);
}

run()
run()
run()
run()
