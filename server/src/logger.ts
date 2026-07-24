import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const LOG_DIR = path.join(__dirname, '..', 'logs');
const NODE_ENV = process.env.NODE_ENV || 'development';

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'cyan',
};
winston.addColors(colors);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, module: mod, requestId, duration, ...rest }) => {
    const modTag = mod ? `[${mod}]` : '';
    const reqTag = requestId ? `[req:${String(requestId).slice(0, 8)}]` : '';
    const durTag = duration !== undefined ? ` (${duration}ms)` : '';
    const extra = Object.keys(rest).length > 0 ? ' ' + JSON.stringify(rest) : '';
    return `${timestamp} ${level} ${modTag}${reqTag} ${message}${durTag}${extra}`;
  })
);

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

const transports: winston.transport[] = [
  new DailyRotateFile({
    filename: path.join(LOG_DIR, 'app-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '50m',
    maxFiles: '30d',
    level: 'debug',
    format: fileFormat,
  }),
  new DailyRotateFile({
    filename: path.join(LOG_DIR, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '50m',
    maxFiles: '30d',
    level: 'error',
    format: fileFormat,
  }),
];

if (NODE_ENV !== 'test') {
  transports.push(
    new winston.transports.Console({
      level: 'debug',
      format: consoleFormat,
    })
  );
}

const logger = winston.createLogger({
  levels,
  transports,
  defaultMeta: { service: 'political-news' },
});

export function createLogger(meta: { module: string }) {
  return logger.child(meta);
}

export default logger;
