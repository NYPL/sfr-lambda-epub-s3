import axios from 'axios'
import LambdaEnvVars from 'lambda-env-vars'
import {checkForExisting, epubStore, epubExplode, getBuffer} from './src/epubParsers'
import {resultHandler} from './src/responseHandlers'

const fileNameRegex = /[0-9]+[.]{1}epub[.]{1}(?:no|)images/

const lambdaEnvVarsClient = new LambdaEnvVars()

var record, fileName, dateUpdated, putParams, handleResp, records, headParams, kinesis

exports.handler = (event, context, callback) => {
    records = event['Records']
    for(var i = 0; i < records.length; i++){
        record = records[i]
        let payload = JSON.parse(new Buffer.from(record.kinesis.data, 'base64').toString('ascii'))
        let url = payload['url']
        let fileNameMatch = fileNameRegex.exec(url)
        if (!fileNameMatch){
            handleResp = {
                "status": 500,
                "code": "Regex Failure",
                "message": "Failed to extract file from url " + url
            }
            resultHandler(handleResp)
            continue
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
                epubExplode(fileName, itemID, response)
                getBuffer(response.data).then((buffer) => {
                    epubStore(fileName, itemID, 'archive', buffer)
                })
                .catch((error) => {
                    handleResp = {
                        "status": 500,
                        "code": "Stream-to-Buffer Error",
                        "message": error
                    }
                    resultHandler(handleResp)
                })

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
        .catch((err) => {
            handleResp = {
                "status": 200,
                "code": "existing",
                "message": "Found existing, up-to-date ePub"
            }
            resultHandler(handleResp)
        })

    }
}
