import axios from 'axios'
import AccessibilityChecker from './src/accessibilityCheck'
import Parser from './src/epubParsers'
import ResHandler from './src/responseHandlers'
import logger from './src/helpers/logger'
import LambdaError from './src/helpers/error'

const fileNameRegex = /[0-9]+[.]{1}epub[.]{1}(?:no|)images/

let records

exports.handler = async (event, context, callback) => {
  logger.debug('Handling input events from Kinesis stream')
  records = event.Records;
  let resp;
  if (!records || records.length < 1) {
    resp = {
      status: 500,
      code: 'missing_records',
      message: 'No records found in event',
    }
    ResHandler.resultHandler(resp)
    return callback(new Error('Kinesis stream failed or contained no records'))
  }

  await exports.parseRecords(records)
  return callback(null, 'Successfully parsed records')
}

exports.parseRecords = () => {
  const results = records.map(exports.parseRecord)
  return new Promise((resolve) => {
    Promise.all(results).then((responses) => {
      responses.forEach((resp) => {
        logger.notice('Completed epub processing')
        logger.debug(JSON.stringify(resp))
      })
      resolve()
    })
  })
}

exports.runAccessCheck = async (zipData, instanceID, fileName, source) => {
  try {
    const identifier = {
      type: source,
      identifier: fileName,
    }
    const reportStatus = await AccessibilityChecker.getAccessibilityReport(zipData, instanceID, identifier)
    return reportStatus
  } catch (err) {
    logger.error('Failed to generate accessibility report for item')
    logger.debug(err)
    throw new LambdaError('Failed to generate Accessibility Report', {
      status: 500,
      code: 'accessibility-report',
    })
  }
}

exports.parseRecord = (record) => {
  let url = null
  let instanceID = null
  let updated = null
  let fileName = null
  let itemData = null
  return new Promise((resolve) => {
    try {
      // Parse base64 json block received from event
      const dataFields = exports.readFromKinesis(record.kinesis.data);
      [url, instanceID, updated, fileName, itemData] = dataFields
      // Take url and metadata and store object at address in S3
      exports.storeFromURL(url, instanceID, updated, fileName, itemData).then((res) => {
        resolve(res)
      }).catch(err => {
        throw err
      })
    } catch (err) {
      logger.error('Error in processing url')
      logger.debug(err)
      const errReport = {
        status: err.status,
        code: err.code,
        message: err.message,
        data: {
          item: instanceID,
        },
      }
      ResHandler.resultHandler(errReport)
      resolve(errReport)
    }
  })
}

exports.readFromKinesis = (record) => {
  const dataBlock = JSON.parse(new Buffer.from(record, 'base64').toString('ascii'))
  const payload = dataBlock.data
  const { url } = payload
  const fileNameMatch = fileNameRegex.exec(url)
  if (!fileNameMatch) {
    logger.error('Provided URL failed to match regular expression')
    throw new LambdaError('Failed to extract file from url ' + url, {
      status: 500,
      code: 'regex-failure',
    })
  }
  const fileName = fileNameMatch[0]
  const instanceID = payload.id
  const updated = new Date(payload.updated)
  const itemData = payload.data
  return [url, instanceID, updated, fileName, itemData]
}

exports.storeFromURL = (url, instanceID, updated, fileName, itemData) => {
  logger.debug('Storing file from ' + url)
  return new Promise((resolve, reject) => {
    Parser.checkForExisting(fileName, updated).then(() => {
      axios({
        method: 'get',
        url: url,
        responseType: 'stream',
      })
        .then((response) => {
          Parser.epubExplode(fileName, instanceID, updated, response, itemData)
          Parser.getBuffer(response.data).then((buffer) => {
            Parser.epubStore(fileName, instanceID, updated, 'archive', buffer, itemData)
            const reportStatus = exports.runAccessCheck(
              buffer,
              instanceID,
              fileName,
              itemData.source,
            )
            return resolve(reportStatus)
          })
            .catch((err) => {
              if (err.name === 'LambdaError') { reject(err) }

              logger.error('Error reading from stream data')
              logger.debug(err)
              reject(new LambdaError('Failed to read stream data from provided URL', {
                status: 500,
                code: 'stream-to-buffer',
              }))
            })
        })
    })
      .catch((err) => {
        logger.notice('Found existing file, no action necessary')
        logger.debug(err)
        return resolve({
          status: 200,
          code: 'existing',
          type: 'item',
          method: 'update',
          message: 'Found existing, up-to-date ePub',
          data: {
            content_type: 'ebook',
            source: itemData.source,
            drm: itemData.drm,
            rights: itemData.rights,
            instance_id: instanceID,
            identifiers: [{
              type: itemData.source,
              identifier: fileName,
            }],
            measurements: itemData.measurements,
          },
        })
      })
  })
}
