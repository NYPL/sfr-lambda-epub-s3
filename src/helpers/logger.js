/* eslint-disable semi */
import { createLogger, format, transports } from 'winston'

// Set default NYPL agreed upon log levels
const levels = {
  emergency: 0,
  alert: 1,
  critical: 2,
  error: 3,
  warning: 4,
  notice: 5,
  info: 6,
  debug: 7
};

// This is a basic format, further detail could be added to the messages
const stdFormat = format.printf(info => {
  return `${info.timestamp} [${info.level}] ${info.message}`
})

const logger = createLogger({
  level: process.env.LOG_LEVEL,
  levels: levels,
  format: format.combine(
    format.timestamp(),
    stdFormat
  ),
  transports: []
})

// If we are running tests, silence the logs
var silent = false
if (process.env.NODE_ENV === 'test') {
  silent = true
}

// Add the winston transporter, more could be added here
logger.add(new transports.Console({
  silent: silent
}))

module.exports = logger;
