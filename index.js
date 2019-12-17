import axios from 'axios'
import Parser from './src/epubParsers'
import ResHandler from './src/responseHandlers'
import logger from './src/helpers/logger'
import LambdaError from './src/helpers/error'
import { formatFileName } from './src/helpers/fileNameParser'
import { exceptions } from 'winston'

exports.handler = async (event, context, callback) => {
  logger.debug('Handling input events from Kinesis stream')
  const records = event.Records;

  if (!records || records.length < 1) {
    const resp = {
      status: 500,
      code: 'missing_records',
      message: 'No records found in event',
    }
    ResHandler.resultHandler(resp)
    return callback(new Error('Kinesis stream failed or contained no records'))
  }
  try {
    await exports.parseRecords(records)
  } catch (err) {
    logger.error('Could not load ebook file')
    logger.debug(err)
    return callback(null, 'Unable to store ebook file')
  }
  return callback(null, 'Successfully parsed records')
}

exports.parseRecords = (records) => {
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

exports.parseRecord = async (record) => {
  let url = null
  let instanceID = null
  let updated = null
  let fileName = null
  let itemData = null
  try {
    // Parse base64 json block received from event
    const dataFields = exports.readFromKinesis(record.kinesis.data);
    [url, instanceID, updated, fileName, itemData] = dataFields;
    // Take url and metadata and store object at address in S3
    return await exports.storeFromURL(url, instanceID, updated, fileName, itemData)
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
    return errReport
  }
}

exports.readFromKinesis = (record) => {
  // eslint-disable-next-line new-cap
  const dataBlock = JSON.parse(new Buffer.from(record, 'base64').toString('ascii'))
  const payload = dataBlock.data
  const { url, fileName } = payload
  const formattedName = fileName || formatFileName(url)
  const instanceID = payload.id
  const updated = new Date(payload.updated)
  const itemData = payload.data
  return [url, instanceID, updated, formattedName, itemData]
}

exports.storeFromURL = (url, instanceID, updated, fileName, itemData) => {
  logger.debug(`Storing file from ${url}`)
  return new Promise((resolve, reject) => {
    Parser.checkForExisting(fileName, updated).then(() => {
      axios({
        method: 'get',
        url,
        responseType: 'stream',
      })
        .then((response) => {
          Parser.epubExplode(fileName, instanceID, updated, response, itemData)
          Parser.getBuffer(response.data).then((buffer) => {
            Parser.epubStore(fileName, instanceID, updated, 'archive', buffer, itemData)
            resolve({
              message: 'Storing/Scoring Epub',
              code: 'success',
              status: 200,
            })
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
        .catch(err => reject(err))
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
