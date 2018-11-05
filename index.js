const AWS = require('aws-sdk')
const axios = require('axios')

import { checkForExisting, epubStore, epubExplode } from './src/epubParsers'
import {resultHandler} from './src/responseHandlers'

AWS.config.update({
    region: 'us-east-1',
    logger: process.stdout
})

const S3 = new AWS.S3({endpoint: 'http://localhost:4572'})

const epubBucket = 'sfr_epub'
const explBucket = 'sfr_expl'

const fileNameRegex = /[0-9]+[.]{1}epub[.]{1}(?:no|)images/

var record, fileName, dateUpdated, putParams, handleResp, records, headParams

exports.handler = (event, context, callback) => {
    records = event['records']
    for(var i = 0; i < records.length; i++){
        record = records[i]
        let url = record['url']
        let fileName = fileNameRegex.exec(url)[0]
        let itemID = record['id']
        let updated = new Date(record['updated'])
        exports.checkForExisting(fileName, updated).then((status) => {
            axios({
                method: 'get',
                url: url,
                responseType: 'stream'
            })
            .then((response) => {
                epubExplode(fileName, itemID, response)
                epubStore(fileName, itemID, epubBucket, response)
            })
            .catch((error) => {
                handleResp = {
                    "status": error.response.status,
                    "code": "Axios Failure",
                    "message":error.response.data
                }
                resultHandler(handleResp)
            })
        })
        .catch((status) => {
            handleResp = {
                "status": 200,
                "code": "existing",
                "message": "Found existing, up-to-date ePub"
            }
            resultHandler(handleResp)
        })

    }
}
