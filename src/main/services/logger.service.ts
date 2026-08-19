import log from 'electron-log'

// Configure electron-log with log rotation and formatted output
log.transports.file.maxSize = 10 * 1024 * 1024 // 10MB
log.transports.file.fileName = 'main.log'
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
log.transports.console.format = '%c{h}:{i}:{s}.{ms}%c › {text}'

export const logger = {
  info: (...params: unknown[]): void => log.info(...params),
  warn: (...params: unknown[]): void => log.warn(...params),
  error: (...params: unknown[]): void => log.error(...params),
  debug: (...params: unknown[]): void => log.debug(...params),
  getLogPath: (): string => log.transports.file.getFile().path
}

export default logger
