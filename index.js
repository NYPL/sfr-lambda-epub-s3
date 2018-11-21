import axios from 'axios'
import AccessibilityChecker from './src/accessibilityCheck'
import Parser from './src/epubParsers'
import ResHandler from './src/responseHandlers'

const fileNameRegex = /[0-9]+[.]{1}epub[.]{1}(?:no|)images/

var records

exports.handler = async (event, context, callback) => {
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

exports.parseRecords = async (records) => {
  let results = records.map(exports.parseRecord)
  return new Promise((resolve, reject) => {
    Promise.all(results).then((responses) => {
      responses.forEach((resp) => {
        console.log(resp)
        ResHandler.resultHandler(resp)
      })
      resolve()
    })
  })
}

exports.runAccessCheck = async (zipData, itemID) => {
  try{
    let accessReport = await AccessibilityChecker.getAccessibilityReport(zipData)
    accessReport['id'] = itemID
    return {
      "status": 200,
      "code": "accessibility",
      "message": "Created Accessibility Score",
      "data": accessReport
    }
  } catch(err) {
    return {
      "status": 500,
      "code": "Accessibility Report Error",
      "data": {
        "id": itemID
      },
      "message": err
    }
  }
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
          let reportBlock = exports.runAccessCheck(buffer, itemID)
          return resolve(reportBlock)
        })
        .catch((error) => {
          return resolve({
            "status": 500,
            "code": "Stream-to-Buffer Error",
            "data": {
              "id": itemID
            },
            "message": error
          })
        })
      })
    })
    .catch((err) => {
      return resolve({
        'status': 200,
        'code': 'existing',
        'message': 'Found existing, up-to-date ePub'
      })
    })
  })
}
