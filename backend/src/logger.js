const levels = { error: 0, warn: 1, info: 2, debug: 3 };

function configuredLevel() {
  const level = process.env.LOG_LEVEL || 'info';
  return Object.hasOwn(levels, level) ? levels[level] : levels.info;
}

function write(level, event, details = {}) {
  if (levels[level] > configuredLevel()) return;

  const output = level === 'error' ? console.error : console.log;
  output(JSON.stringify({ level, event, ...details }));
}

module.exports = {
  error: (event, details) => write('error', event, details),
  warn: (event, details) => write('warn', event, details),
  info: (event, details) => write('info', event, details),
  debug: (event, details) => write('debug', event, details),
};