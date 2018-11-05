import AWS from 'aws-sdk'
import unzip from 'unzip-stream'
import stream from 'stream'
import {resultHandler} from './responseHandlers'

AWS.config.update({
    region: 'us-east-1',
    logger: process.stdout
})

var customS3Endpoint
if(process.env.AWS_S3_ENDPOINT){
    customS3Endpoint = {endpoint: process.env.AWS_S3_ENDPOINT}
}
const S3 = new AWS.S3(customS3Endpoint)
var handleResp

export const checkForExisting = (fileName, updated, bucket) => {
    return new Promise((resolve, reject) => {
        let headParams = {
            Bucket: bucket,
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

export const epubStore = (fileName, itemID, bucket, response) => {
    let putData
    if(bucket == 'sfr_epub') putData = response.data
    else putData = response
    let putParams = {
        Body: putData,
        Bucket: bucket,
        Key: fileName,
        ACL: 'public-read'
    }
    let uploadProm = S3.upload(putParams).promise()
    uploadProm.then((data) => {
        let handleResp = {
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
        let handleResp = {
            "status": err.statusCode,
            "code": err.code,
            "message": err.message
        }

    })
    .then(() => {
        resultHandler(handleResp)
    })
}

export const epubExplode = (fileName, itemID, response) => {
    try{
        response.data.pipe(unzip.Parse())
        .on('entry', function (entry) {
            let partName = fileName + '/' + entry.path
            exports.epubStore(partName, itemID, explBucket, entry)
        })

    } catch (err) {
        let handleResp = {
            "status": err.statusCode,
            "code": err.code,
            "message": err.message
        }
        resultHandler(handleResp)
    }

}
