import axios from 'axios'
import LambdaEnvVars from 'lambda-env-vars'
import {checkForExisting, epubStore, epubExplode} from './src/epubParsers'
import {resultHandler} from './src/responseHandlers'

const fileNameRegex = /[0-9]+[.]{1}epub[.]{1}(?:no|)images/

const lambdaEnvVarsClient = new LambdaEnvVars()

var record, fileName, dateUpdated, putParams, handleResp, records, headParams

exports.handler = (event, context, callback) => {
    records = event['records']
    for(var i = 0; i < records.length; i++){
        record = records[i]
        let url = record['url']
        let fileName = fileNameRegex.exec(url)[0]
        let itemID = record['id']
        let updated = new Date(record['updated'])
        checkForExisting(fileName, updated).then((status) => {
            axios({
                method: 'get',
                url: url,
                responseType: 'stream'
            })
            .then((response) => {
                epubExplode(fileName, itemID, response)
                epubStore(fileName, itemID, 'archive', response)
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
