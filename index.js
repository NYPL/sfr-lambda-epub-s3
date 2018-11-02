const AWS = require('aws-sdk')
const axios = require('axios')

AWS.config.update({
    region: 'us-east-1',
    logger: process.stdout
})

const S3 = new AWS.S3({endpoint: 'http://localhost:4572'})

const epubBucket = 'sfr_epub'
const explBucket = 'sfr_expl'

const fileNameRegex = /[0-9]+[.]{1}epub[.]{1}(?:no|)images/

var record, fileName, dateUpdated, putParams, handleResp, records, headParams

exports.resultHandler = (handleResp) => {
    // TODO Pass the results to SQS/Kinesis/postgresql
    console.log(handleResp)
}

exports.checkForExisting = (fileName, updated) => {
    return new Promise((resolve, reject) => {
        headParams = {
            Bucket: epubBucket,
            Key: fileName,
            IfUnmodifiedSince: updated
        }
        let fileCheck = S3.headObject(headParams).promise()
        fileCheck.then((data) => {
            reject(false)
        })
        .catch((err) => {
            if(err.statusCode == 412) reject(false)
            else resolve(true)
        })
    })
}

exports.epubStore = (fileName, itemID, response) => {
    putParams = {
        Body: response.data,
        Bucket: epubBucket,
        Key: fileName,
        ACL: 'public-read'
    }
    let uploadProm = S3.upload(putParams).promise()
    uploadProm.then((data) => {
        handleResp = {
            "status": 200,
            "code": "stored",
            "message": "Stored ePub",
            "data": {
                "etag": data["ETag"],
                "url": data["Location"],
                "id": itemID
            }
        }
    })
    .catch((err) => {
        handleResp = {
            "status": err.statusCode,
            "code": err.code,
            "message": err.message
        }

    })
    .then(() => {
        exports.resultHandler(handleResp)
    })
}

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
                responseType: 'arraybuffer'
            })
            .then((response) => {
                exports.epubStore(fileName, itemID, response)
            })
            .catch((error) => {
                handleResp = {
                    "status": error.response.status,
                    "code": "Axios Failure",
                    "message":error.response.data
                }
                exports.resultHandler(handleResp)
            })
        })
        .catch((status) => {
            handleResp = {
                "status": 200,
                "code": "existing",
                "message": "Found existing, up-to-date ePub"
            }
            exports.resultHandler(handleResp)
        })
    }
}
