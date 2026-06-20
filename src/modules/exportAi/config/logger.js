/* Minimal console logger (avoids adding winston). Mirrors the winston API
   surface used across the module: info/warn/error with optional meta. */
const fmt = (level, msg, meta) => {
  const ts = new Date().toISOString();
  const rest = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return `${ts} ${level}: ${msg}${rest}`;
};

const logger = {
  info: (msg, meta) => console.log(fmt("info", msg, meta)),
  warn: (msg, meta) => console.warn(fmt("warn", msg, meta)),
  error: (msg, meta) => console.error(fmt("error", msg, meta)),
};

module.exports = { logger };
