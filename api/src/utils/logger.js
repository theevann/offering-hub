const levels = { debug: 0, info: 1, warn: 2, error: 3 };

function createLogger(service) {
  return Object.fromEntries(
    Object.entries(levels).map(([level, priority]) => [
      level,
      (...args) => {
        // Read at log time so standalone scripts can load their environment first.
        const serviceLevel = process.env[`LOG_LEVEL_${service.toUpperCase()}`];
        const threshold = levels[serviceLevel] ?? levels[process.env.LOG_LEVEL] ?? levels.info;

        if (priority < threshold) return;

        const prefix = `${new Date().toISOString()} ${level.toUpperCase()} [${service}]`;
        console[level](prefix, ...args);
      }
    ])
  );
}

module.exports = { createLogger };
