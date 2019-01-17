import AWS from 'aws-sdk'
import unzip from 'unzip-stream'
import ResHandler from './responseHandlers'
import logger from './helpers/logger'

AWS.config.update({
  region: 'us-east-1',
  logger: process.stdout
})

var customS3Endpoint
if (process.env.AWS_S3_ENDPOINT) {
  customS3Endpoint = {
    endpoint: process.env.AWS_S3_ENDPOINT,
    s3ForcePathStyle: true
  }
}
const S3 = new AWS.S3(customS3Endpoint)

exports.checkForExisting = (fileName, updated, bucket) => {
  logger.debug('Searching for an existing ePub file')
  return new Promise((resolve, reject) => {
    let headParams = {
      Bucket: process.env.AWS_S3_EPUB_BUCKET,
      Key: 'epub_test/' + fileName,
      IfUnmodifiedSince: updated
    }
    let fileCheck = S3.headObject(headParams).promise()
    fileCheck.then((data) => {
      logger.debug('Found an existing ePub file in S3')
      reject(false)
    })
      .catch((err) => {
        if (err.statusCode === 412) {
          logger.debug('Found an existing ePub file in S3')
          reject(err)
        } else {
          logger.debug('No file found, store new file in S3')
          resolve(true)
        }
      })
  })
}

exports.getBuffer = (stream) => {
  logger.info('Converting stream object into a buffer')
  return new Promise((resolve, reject) => {
    let buffers = []
    stream.on('error', (e) => reject(e))
    stream.on('data', (data) => buffers.push(data))
    stream.on('end', () => resolve(Buffer.concat(buffers)))
  })
}

exports.epubStore = (partName, instanceID, updated, type, response, itemData, fileName) => {
  logger.info('Storing ' + partName + ' in S3')
  let putData, putKey
  if (type === 'archive') {
    putData = response
    putKey = 'epub_test/' + partName
  } else {
    putData = response
    putKey = 'expl_test/' + partName
  }
  let putParams = {
    Body: putData,
    Bucket: process.env.AWS_S3_EPUB_BUCKET,
    Key: putKey,
    ACL: 'public-read'
  }
  fileName = fileName || partName
  let uploadProm = S3.upload(putParams).promise()
  uploadProm.then((data) => {
    if (type === 'archive' || type === 'explMain') {
      let handleResp = {
        'status': 200,
        'code': 'stored',
        'message': 'Stored ePub',
        'type': 'item',
        'method': 'insert',
        'data': {
          'content_type': 'ebook',
          'source': itemData['source'],
          'drm': itemData['drm'],
          'rights_uri': itemData['rights_uri'],
          'instance_id': instanceID,
          'modified': updated.toISOString(),
          'identifier': {
            'type': itemData['source'],
            'identifier': fileName
          },
          'link': {
            'url': data['Location'],
            'md5': data['ETag'],
            'rel_type': type,
            'media_type': 'application/epub+zip'
          },
          'measurements': itemData['measurements']
        }
      }
      ResHandler.resultHandler(handleResp)
    } else {
      logger.notice('Stored component of exploded ePub')
    }
  })
    .catch((err) => {
      let handleResp = {
        'status': err.statusCode,
        'code': err.code,
        'message': err.message
      }
      ResHandler.resultHandler(handleResp)
    })
}

exports.epubExplode = (fileName, itemID, updated, response, itemData) => {
  logger.info('Exploding archived ePub file')
  try {
    response.data.pipe(unzip.Parse())
      .on('entry', function (entry) {
        let partName = fileName + '/' + entry.path
        let putType = 'explPart'
        if (entry.path.includes('content.opf')) putType = 'explMain'
        exports.epubStore(partName, itemID, updated, putType, entry, itemData, fileName)
      })
  } catch (err) {
    logger.error('Could not unzip ePub archive!')
    let handleResp = {
      'status': err.statusCode,
      'code': err.code,
      'message': err.message
    }
    ResHandler.resultHandler(handleResp)
  }
}
