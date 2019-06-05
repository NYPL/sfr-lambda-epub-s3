import logger from './helpers/logger'
import LambdaError from './helpers/error'
import { sqsHandler } from './responseHandlers'

exports.runAccessCheck = async (fileKey, instanceID, fileName, source) => {
  try {
    const identifier = {
      type: source,
      identifier: fileName,
    }
    return await exports.createAccessibilityReport(fileKey, instanceID, identifier)
  } catch (err) {
    logger.error('Failed to generate accessibility report for item')
    logger.debug(err)
    throw new LambdaError('Failed to generate Accessibility Report', {
      status: 500,
      code: 'accessibility-report',
    })
  }
}

exports.createAccessibilityReport = (key, instID, ident) => {
  return new Promise((resolve, reject) => {
    const reportBlock = {
      instanceID: instID,
      identifier: ident,
      fileKey: key,
    }
    try {
      resolve(sqsHandler(reportBlock, process.env.ACE_REPORT_QUEUE))
    } catch (e) {
      logger.error(e, e.stack)
      reject(e)
    }
  })
}
