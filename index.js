import axios from 'axios'
import Parser from './src/epubParsers'
import ResHandler from './src/responseHandlers'

const fileNameRegex = /[0-9]+[.]{1}epub[.]{1}(?:no|)images/

var records

exports.handler = (event, context, callback) => {
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
    exports.parseRecords(records)
    return callback(null, 'Successfully parsed records')
  }
}

exports.parseRecords = async (records) => {
  let results = records.map(exports.parseRecord)
  await Promise.all(results)
  results.forEach((res) => {
    ResHandler.resultHandler(res)
  })
}

exports.parseRecord = (record) => {
  let payload = JSON.parse(new Buffer.from(record.kinesis.data, 'base64').toString('ascii'))
  let url = payload['url']
  let fileNameMatch = fileNameRegex.exec(url)
  if (!fileNameMatch) {
    return {
      'status': 500,
      'code': 'Regex Failure',
      'message': 'Failed to extract file from url ' + url
    }
  }
  let fileName = fileNameMatch[0]
  let itemID = payload['id']
  let updated = new Date(payload['updated'])
  return new Promise((resolve, reject) => {
    Parser.checkForExisting(fileName, updated).then((status) => {
      axios({
        method: 'get',
        url: url,
        responseType: 'stream'
      })
        .then((response) => {
          Parser.epubExplode(fileName, itemID, updated, response)
          Parser.getBuffer(response.data).then((buffer) => {
            Parser.epubStore(fileName, itemID, updated, 'archive', buffer)
            resolve()
          })
            .catch((error) => {
              return reject({
                'status': 500,
                'code': 'Stream-to-Buffer Error',
                'message': error
              })
            })
        })
        .catch((error) => {
          return reject({
            'status': error.response.status,
            'code': 'Axios Failure',
            'message': error.response.data
          })
        })
    })
      .catch((err) => {
        return reject({
          'status': 200,
          'code': 'existing',
          'message': 'Found existing, up-to-date ePub'
        })
      })
  })
}
