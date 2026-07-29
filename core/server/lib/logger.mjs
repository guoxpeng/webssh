const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
const currentLevel = LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LEVELS.info;
const EPOCH = Date.now();

function ts() {
  const delta = Date.now() - EPOCH;
  return `+${(delta / 1000).toFixed(1)}s`;
}

function format(level, tag, msg, extra) {
  const parts = [`[${ts()}]`, `[${level.toUpperCase()}]`, tag ? `[${tag}]` : '', msg];
  if (extra) parts.push(extra instanceof Error ? `${extra.message} ${extra.stack?.split('\n').slice(0, 3).join(' | ') || ''}` : JSON.stringify(extra));
  return parts.filter(Boolean).join(' ');
}

function log(level, tag, msg, extra) {
  if (LEVELS[level] > currentLevel) return;
  const line = format(level, tag, msg, extra);
  if (level === 'error') console.error(line);
  else console.log(line);
}

export function logger(tag) {
  return {
    error: (msg, extra) => log('error', tag, msg, extra),
    warn: (msg, extra) => log('warn', tag, msg, extra),
    info: (msg, extra) => log('info', tag, msg, extra),
    debug: (msg, extra) => log('debug', tag, msg, extra),
  };
}

export function getLevel() {
  return Object.keys(LEVELS).find(k => LEVELS[k] === currentLevel) || 'info';
}
