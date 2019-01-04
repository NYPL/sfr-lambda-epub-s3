import axios from 'axios'
import AccessibilityChecker from './src/accessibilityCheck'
import Parser from './src/epubParsers'
import ResHandler from './src/responseHandlers'
import logger from './src/helpers/logger'
import LambdaError from './src/helpers/error'

const fileNameRegex = /[0-9]+[.]{1}epub[.]{1}(?:no|)images/

var records

exports.handler = async (event, context, callback) => {
  logger.debug('Handling input events from Kinesis stream')
  records = event['Records']
  let resp
  if (!records || records.length < 1) {
    resp = {
      'status': 500,
      'code': 'missing_records',
      'message': 'No records found in event'
    }
    ResHandler.resultHandler(resp)
    return callback(new Error('Kinesis stream failed or contained no records'))
  } else {
    await exports.parseRecords(records)
    return callback(null, 'Successfully parsed records')
  }
}

exports.parseRecords = (records) => {
  let results = records.map(exports.parseRecord)
  return new Promise((resolve, reject) => {
    Promise.all(results).then((responses) => {
      responses.forEach((resp) => {
        ResHandler.resultHandler(resp)
      })
      resolve()
    })
  })
}

exports.runAccessCheck = async (zipData, instanceID, fileName, source) => {
  try {
    let accessReport = await AccessibilityChecker.getAccessibilityReport(zipData)
    accessReport['instance_id'] = instanceID
    accessReport['identifier'] = {
      'type': source,
      'identifier': fileName
    }
    return {
      'status': 200,
      'code': 'accessibility',
      'message': 'Created Accessibility Score',
      'type': 'access_report',
      'method': 'insert',
      'data': accessReport
    }
  } catch (err) {
    logger.error('Failed to generate accessibility report for item')
    logger.debug(err)
    throw new LambdaError('Failed to generate Accessibility Report', {
      'status': 500,
      'code': 'accessibility-report'
    })
  }
}

exports.parseRecord = (record) => {
  let instanceID, url, updated, fileName, itemData
  return new Promise((resolve, reject) => {
    try {
      // Parse base64 json block received from event
      let dataFields = exports.readFromKinesis(record.kinesis.data)
      url = dataFields[0]
      instanceID = dataFields[1]
      updated = dataFields[2]
      fileName = dataFields[3]
      itemData = dataFields[4]
      // Take url and metadata and store object at address in S3
      exports.storeFromURL(url, instanceID, updated, fileName, itemData).then((res) => {
        resolve(res)
      }).catch(err => {
        throw err
      })
    } catch (err) {
      logger.error('Error in processing url')
      logger.debug(err)
      resolve({
        'status': err.status,
        'code': err.code,
        'message': err.message,
        'data': {
          'item': itemID
        }
      })
    }
  })
}

exports.readFromKinesis = (record) => {
  let dataBlock = JSON.parse(new Buffer.from(record, 'base64').toString('ascii'))
  let payload = dataBlock['data']
  let url = payload['url']
  let fileNameMatch = fileNameRegex.exec(url)
  if (!fileNameMatch) {
    logger.error('Provided URL failed to match regular expression')
    throw new LambdaError('Failed to extract file from url ' + url, {
      'status': 500,
      'code': 'regex-failure'
    })
  }
  let fileName = fileNameMatch[0]
  let instanceID = payload['id']
  let updated = new Date(payload['updated'])
  let itemData = payload['data']
  return [url, instanceID, updated, fileName, itemData]
}

exports.storeFromURL = (url, instanceID, updated, fileName, itemData) => {
  logger.debug('Storing file from ' + url)
  return new Promise((resolve, reject) => {
    Parser.checkForExisting(fileName, updated).then((status) => {
      axios({
        method: 'get',
        url: url,
        responseType: 'stream'
      })
        .then((response) => {
          Parser.epubExplode(fileName, instanceID, updated, response, itemData)
          Parser.getBuffer(response.data).then((buffer) => {
            Parser.epubStore(fileName, instanceID, updated, 'archive', buffer, itemData)
            let reportBlock = exports.runAccessCheck(buffer, instanceID, fileName, itemData['source'])
            return resolve(reportBlock)
          })
            .catch((err) => {
              if (err.name === 'LambdaError') { reject(err) }

              logger.error('Error reading from stream data')
              logger.debug(err)
              reject(new LambdaError('Failed to read stream data from provided URL', {
                'status': 500,
                'code': 'stream-to-buffer'
              }))
            })
        })
    })
      .catch((err) => {
        logger.notice('Found existing file, no action necessary')
        logger.debug(err)
        return resolve({
          'status': 200,
          'code': 'existing',
          'message': 'Found existing, up-to-date ePub'
        })
      })
  })
}
