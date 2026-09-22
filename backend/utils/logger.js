const path = require("path");

let pipelineStart = 0;
const moduleTimes = new Map();

function now() {
  return new Date().toLocaleTimeString("en-GB", {
    hour12: false
  });
}

function hr() {
  return Number(process.hrtime.bigint()) / 1e6;
}

function stackLine(err) {
  if (!err || !err.stack) return "-";

  const lines = err.stack.split("\n");

  for (const line of lines) {
    if (line.includes("backend")) {
      return line.trim();
    }
  }

  return lines[1]?.trim() || "-";
}

module.exports = {

  info(moduleName, message) {
    console.log(`[${moduleName}] Info: ${message}`);
  },

  success(moduleName, message) {
    console.log(`[${moduleName}] Success: ${message}`);
  },

  start(question = "") {

    pipelineStart = hr();

    console.log("\n==================================================");
    console.log("PIPELINE START");
    console.log("==================================================");

    console.log(`Time     : ${now()}`);

    if (question) {
      console.log(`Question : ${question}`);
    }

    console.log("");

  },

  moduleStart(name) {

    moduleTimes.set(name, hr());

    console.log("----------------------------------------");
    console.log(name);
    console.log("----------------------------------------");

  },

  moduleSuccess(name, extra = "") {

    const start = moduleTimes.get(name) || hr();

    const elapsed = (hr() - start).toFixed(2);

    console.log("Status : OK");

    console.log(`Time   : ${elapsed} ms`);

    if (extra) {
      console.log(extra);
    }

    console.log("");

  },

  moduleFail(name, err) {

    const start = moduleTimes.get(name) || hr();

    const elapsed = (hr() - start).toFixed(2);

    console.log("Status : FAILED");

    console.log(`Time   : ${elapsed} ms`);

    console.log("");

    console.log("Reason");

    console.log("------");

    console.log(err.message);

    if (err.response) {

      console.log("");

      console.log(`HTTP : ${err.response.status}`);

    }

    console.log("");

    console.log("Stack");

    console.log("-----");

    console.log(stackLine(err));

    console.log("");

  },

  pipelineInfo(data = {}) {

    if (data.provider)
      console.log(`Provider : ${data.provider}`);

    if (data.model)
      console.log(`Model    : ${data.model}`);

    if (data.task)
      console.log(`Task     : ${data.task}`);

    console.log("");

  },

  finish() {

    const total = (hr() - pipelineStart).toFixed(2);

    console.log("==================================================");

    console.log("PIPELINE FINISH");

    console.log("==================================================");

    console.log(`Total Time : ${total} ms`);

    console.log("");

  },

  error(err) {

    const total = (hr() - pipelineStart).toFixed(2);

    console.log("==================================================");

    console.log("PIPELINE ERROR");

    console.log("==================================================");

    console.log(`Type   : ${err.name}`);

    console.log(`Reason : ${err.message}`);

    if (err.response) {

      console.log(`Status : ${err.response.status}`);

    }

    console.log("");

    console.log(stackLine(err));

    console.log("");

    console.log(`Elapsed : ${total} ms`);

    console.log("==================================================");

  }

};
