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
    customS3Endpoint = {
	endpoint: process.env.AWS_S3_ENDPOINT,
	s3ForcePathStyle: true
    }
}
const S3 = new AWS.S3(customS3Endpoint)
var handleResp

export const checkForExisting = (fileName, updated, bucket) => {
    return new Promise((resolve, reject) => {
        let headParams = {
            Bucket: process.env.AWS_S3_EPUB_BUCKET,
            Key: 'epub_test/' + fileName,
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

export const getBuffer = (stream) => {
    return new Promise((resolve, reject) => {
        let buffers = []
        stream.on('error', (e) => reject(e))
        stream.on('data', (data) => buffers.push(data))
        stream.on('end', () => resolve(Buffer.concat(buffers)))
    })
}

export const epubStore = (fileName, itemID, updated, type, response) => {
    let putData, putKey
    if(type == 'archive'){
        putData = response
        putKey = 'epub_test/' + fileName
        console.log(putData)
    } else{
        putData = response
        putKey = 'expl_test/' + fileName
    }
    let putParams = {
        Body: putData,
        Bucket: process.env.AWS_S3_EPUB_BUCKET,
        Key: putKey,
        ACL: 'public-read'
    }
    let uploadProm = S3.upload(putParams).promise()
    uploadProm.then((data) => {
        if(type == 'archive' || type == 'explMain'){
            let handleResp = {
                "status": 200,
                "code": "stored",
                "message": "Stored ePub",
                "data": {
                    "type": type,
                    "etag": data["ETag"],
                    "url": data["Location"],
                    "id": itemID,
                    "date_updated": updated.toISOString()
                }
            }
            resultHandler(handleResp)
        } else {
            console.log("Stored component of exploded ePub")
        }
    })
    .catch((err) => {
        let handleResp = {
            "status": err.statusCode,
            "code": err.code,
            "message": err.message
        }
        resultHandler(handleResp)
    })
}

export const epubExplode = (fileName, itemID, updated, response) => {
    try{
        response.data.pipe(unzip.Parse())
        .on('entry', function (entry) {
            let partName = fileName + '/' + entry.path
            let putType = 'explPart'
            if (entry.path.includes('content.opf')) putType = 'explMain'
            exports.epubStore(partName, itemID, updated, putType, entry)
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
