const fs = require("node:fs");
const path = require("node:path");
const { format } = require("node:util");

const logFolder = path.resolve(process.env.LOG_FOLDER || "..data/logs/api");
console.log(`Logging to ${process.env.LOG_FOLDER}`);
fs.mkdirSync(logFolder, { recursive: true });

const levels = { debug: 0, info: 1, warn: 2, error: 3 };

function createLogger(service) {
  
  return Object.fromEntries(
    Object.entries(levels).map(([level, priority]) => [
      level,
      (...args) => {
        // Read at log time so standalone scripts can load their environment first.
        const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format
        const serviceLevel = process.env[`LOG_LEVEL_${service.toUpperCase()}`];
        const threshold = levels[serviceLevel] ?? levels[process.env.LOG_LEVEL] ?? levels.info;

        const prefix = `${new Date().toISOString()} ${level.toUpperCase()} [${service}]`;

        const logFile = path.resolve(logFolder, `${date}.log`); //date
        fs.appendFileSync(logFile, `${prefix} ${format(...args)}\n`);

        if (priority < threshold) return;
        console[level](prefix, ...args);
      }
    ])
  );
}

module.exports = { createLogger };
