import axios from 'axios'
import LambdaEnvVars from 'lambda-env-vars'
import {checkForExisting, epubStore, epubExplode, getBuffer} from './src/epubParsers'
import ResHandler from './src/responseHandlers'

const fileNameRegex = /[0-9]+[.]{1}epub[.]{1}(?:no|)images/

const lambdaEnvVarsClient = new LambdaEnvVars()

var record, fileName, dateUpdated, putParams, handleResp, records, headParams, kinesis

exports.handler = (event, context, callback) => {
  records = event['Records']
  let resp
  if (!records || records.length < 1){
    resp = {
        "status": 500,
        "code": "missing_records",
        "message": "No records found in event"
    }
    ResHandler.resultHandler(resp)
    return callback(new Error('Kinesis stream failed or contained no records'))
  } else{
    let success = exports.parseRecords(records)
    return callback(null, 'Successfully parsed records')
  }
}

exports.parseRecords = (records) => {
  for(var i = 0; i < records.length; i++){
    let resp = exports.parseRecord(records[i])
    ResHandler.resultHandler(resp)
  }
}

exports.parseRecord = (record) => {
  let payload = JSON.parse(new Buffer.from(record.kinesis.data, 'base64').toString('ascii'))
  let url = payload['url']
  let fileNameMatch = fileNameRegex.exec(url)
  if (!fileNameMatch){
      return {
          "status": 500,
          "code": "Regex Failure",
          "message": "Failed to extract file from url " + url
      }
  }
  let fileName = fileNameMatch[0]
  let itemID = payload['id']
  let updated = new Date(payload['updated'])
  checkForExisting(fileName, updated).then((status) => {
      axios({
          method: 'get',
          url: url,
          responseType: 'stream'
      })
      .then((response) => {
          epubExplode(fileName, itemID, updated, response)
          getBuffer(response.data).then((buffer) => {
              epubStore(fileName, itemID, updated, 'archive', buffer)
          })
          .catch((error) => {
              return {
                  "status": 500,
                  "code": "Stream-to-Buffer Error",
                  "message": error
              }
          })

      })
      .catch((error) => {
          return {
              "status": error.response.status,
              "code": "Axios Failure",
              "message":error.response.data
          }
      })
  })
  .catch((err) => {
      return {
          "status": 200,
          "code": "existing",
          "message": "Found existing, up-to-date ePub"
      }
  })
}
