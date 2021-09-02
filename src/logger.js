
let logger = console

export const DEBUG = 5;
export const INFO = 4;
export const WARN = 2;
export const ERROR = 1;
export const NOTHING = 0;
let level = INFO;
export default {
  error: function() { if (level >= ERROR) return logger.error(...arguments); },
  warn: function() { if (level >= WARN) return logger.warn(...arguments); },
  info: function() { if (level >= INFO) return logger.info(...arguments); },
  debug: function() { if (level >= DEBUG) return logger.debug(...arguments); },
};

export const setLogger = (newLogger) => {
  logger = newLogger;
  level = DEBUG;
};

export const getLogger = () => {
  return logger;
};

export const setLevel = (lv) => {
  level = lv || INFO;
}
