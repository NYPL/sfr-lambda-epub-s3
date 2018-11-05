const unzip = require('unzip-stream')
const stream = require('stream')
const fs = require('fs')

import {resultHandler} from './responseHandlers'

const checkForExisting = (fileName, updated) => {
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

const epubStore = (fileName, itemID, bucket, response) => {
    let putData
    if(bucket == 'sfr_epub') putData = response.data
    else putData = response
    putParams = {
        Body: putData,
        Bucket: bucket,
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
        resultHandler(handleResp)
    })
}

const epubExplode = (fileName, itemID, response) => {
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
