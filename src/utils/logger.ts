import winston from 'winston'
import { red, yellow, blue, magenta, green } from 'colorette'

const levelColor: Record<'error' | 'warn' | 'info' | 'http' | 'debug', string> =
  {
    error: red('ERROR'),
    warn: yellow('WARN'),
    info: blue('INFO'),
    http: magenta('HTTP'),
    debug: green('DEBUG'),
  }

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      const coloredLevel =
        levelColor[level as keyof typeof levelColor] || level.toUpperCase()
      return `[${timestamp}] ${coloredLevel}: ${message}`
    }),
  ),
  transports: [new winston.transports.Console()],
})
