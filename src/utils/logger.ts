import winston from 'winston'
import { safeLogMessage } from './logPrivacy'

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf((info) =>
      JSON.stringify({
        timestamp: info.timestamp,
        level: info.level,
        event:
          typeof info.event === 'string'
            ? safeLogMessage(info.event)
            : 'application',
        message: safeLogMessage(info.message),
        ...Object.fromEntries(
          ['method', 'path', 'status', 'duration_ms', 'request_id']
            .filter(
              (key) =>
                typeof info[key] === 'string' || typeof info[key] === 'number',
            )
            .map((key) => [
              key,
              typeof info[key] === 'string'
                ? safeLogMessage(info[key])
                : info[key],
            ]),
        ),
      }),
    ),
  ),
  transports: [new winston.transports.Console()],
})
