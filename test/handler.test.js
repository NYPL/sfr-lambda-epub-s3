/* eslint-disable semi, no-unused-expressions */
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import sinon from 'sinon'
import sinonChai from 'sinon-chai'
import nock from 'nock'
import Lambda from '../index.js'
import ResHandler from '../src/responseHandlers.js'
import Parser from '../src/epubParsers.js'
import AccessibilityChecker from '../src/accessibilityCheck'
import LambdaError from '../src/helpers/error'
import moment from 'moment'
chai.should()
chai.use(sinonChai)
chai.use(chaiAsPromised)
const expect = chai.expect

describe('Handlers [index.js]', () => {
  describe('exports.handler', () => {
    let handlerStub, parseStub
    beforeEach(() => {
      handlerStub = sinon.stub(ResHandler, 'resultHandler')
      parseStub = sinon.stub(Lambda, 'parseRecords')
    })

    afterEach(() => {
      handlerStub.restore()
      parseStub.restore()
    })

    it('should return 500 if no records in array', () => {
      let event = {
        'Records': []
      }
      let callback = sinon.spy()
      Lambda.handler(event, null, callback)
      expect(handlerStub).to.be.called
      expect(parseStub).to.be.not.called
    })

    it('should return 500 if records is undefined or false', () => {
      let event = {}
      let callback = sinon.spy()
      Lambda.handler(event, null, callback)
      expect(handlerStub).to.be.called
      expect(parseStub).to.be.not.called
    })

    it('should call parse Records if we have items in the array', () => {
      let event = {
        'Records': [{
          'kinesis': {
            'data': 'base64stuffhere'
          }
        }]
      }
      let callback = sinon.spy()
      Lambda.handler(event, null, callback)
      expect(handlerStub).to.be.not.called
      expect(parseStub).to.be.called
    })
  })

  describe('parseRecords(records)', () => {
    let handlerStub, parseStub
    beforeEach(() => {
      handlerStub = sinon.stub(ResHandler, 'resultHandler')
      parseStub = sinon.stub(Lambda, 'parseRecord')
    })

    afterEach(() => {
      handlerStub.restore()
      parseStub.restore()
    })

    it('should call record parser and result handler for each record', async () => {
      let records = [
        {
          'id': 1
        }, {
          'id': 2
        }
      ]
      await Lambda.parseRecords(records)
      expect(handlerStub).to.be.calledTwice
      expect(parseStub).to.be.calledTwice
    })
  })

  describe('parseRecord(record)', () => {
    let testRecord, testData, readStub, storeStub
    beforeEach(() => {
      testData = {
        'url': 'http://www.gutenberg.org/ebooks/10.epub.images',
        'id': '10',
        'updated': moment().format()
      }
      testRecord = {
        'kinesis': {
          'data': null
        }
      }

      readStub = sinon.stub(Lambda, 'readFromKinesis')
      storeStub = sinon.stub(Lambda, 'storeFromURL')

    })

    afterEach(() => {
      readStub.restore()
      storeStub.restore()
    })

    it('should return error block for invalid URL', async () => {
      testData['url'] = 'http://www/gutenberg/org/notReal'
      testRecord['kinesis']['data'] = Buffer.from(JSON.stringify(testData)).toString('base64')

      readStub.returns(['url', 1, '2018-01-01', 'fileName'])
      storeStub.throws(new LambdaError('Bad URL', {
        'status': 500,
        'code': 'Regex Failure'
      }))
      try {
        await Lambda.parseRecord(testRecord)
      } catch (err) {
        expect(err['status']).to.equal(500)
        expect(err['code']).to.equal('Regex Failure')
      }
    })

    it('should return existing message for non-modifed record', async () => {
      testData['updated'] = '1990-01-01'
      testRecord['kinesis']['data'] = Buffer.from(JSON.stringify(testData)).toString('base64')

      storeStub.rejects('Out-of-date-file!')
      try {
        await Lambda.parseRecord(testRecord)
      } catch (e) {
        expect(e['status']).to.equal(200)
        expect(e['code']).to.equal('existing')
      }
    })

    it('should call ePubExplode, getBuffer and epubStore for success', async () => {
      testRecord['kinesis']['data'] = Buffer.from(JSON.stringify(testData)).toString('base64')

      readStub.returns('status')
      storeStub.resolves({ 'data': 'data' })

      await Lambda.parseRecord(testRecord)
      expect(readStub).to.be.called
      expect(storeStub).to.be.called

    })

    it('should return 500 if it cannot load a buffer from provided URL', async () => {
      testRecord['kinesis']['data'] = Buffer.from(JSON.stringify(testData)).toString('base64')

      readStub.returns('status')
      storeStub.throws(new LambdaError('Bad URL', {
        'status': 500,
        'code': 'Stream-to-Buffer Error'
      }))

      try {
        await Lambda.parseRecord(testRecord)
      } catch (e) {
        expect(e['status']).to.equal(500)
        expect(e['code']).to.equal('Stream-to-Buffer Error')
      }

    })
  })

  describe('readFromKinesis(record)', () => {
    let testRecord, testData
    beforeEach(() => {
      testData = {
        'data': {
          'url': 'http://www.gutenberg.org/ebooks/10.epub.images',
          'id': '10',
          'updated': moment().format()
        }
      }
      testRecord = {
        'kinesis': {
          'data': null
        }
      }

    })

    it('should return data fields', () => {
      testRecord['kinesis']['data'] = Buffer.from(JSON.stringify(testData)).toString('base64')
      let results = Lambda.readFromKinesis(testRecord.kinesis.data)
      expect(results[0]).to.equal('http://www.gutenberg.org/ebooks/10.epub.images')
      expect(results[1]).to.equal('10')
      expect(results[2]).to.deep.equal(new Date(testData['data']['updated']))
    })

    it('should throw LambdaError if regex match fails', () => {
      testData['data']['url'] = 'http://www/gutenberg/org/notReal'
      testRecord['kinesis']['data'] = Buffer.from(JSON.stringify(testData)).toString('base64')
      try {
        results = Lambda.readFromKinesis(testRecord.kinesis.data)
      } catch(err) {
        expect(err.status).to.equal(500)
        expect(err.code).to.equal('regex-failure')
      }
    })
  })

  describe('storeFromURL(url, itemID, updated, fileName)', () => {
    let explodeStub, bufferStub, storeStub, accessStub, checkStub
    beforeEach(() => {
      checkStub = sinon.stub(Parser, 'checkForExisting')
      explodeStub = sinon.stub(Parser, 'epubExplode')
      bufferStub = sinon.stub(Parser, 'getBuffer')
      storeStub = sinon.stub(Parser, 'epubStore')
      accessStub = sinon.stub(Lambda, 'runAccessCheck')
    })

    afterEach(() => {
      checkStub.restore()
      explodeStub.restore()
      bufferStub.restore()
      storeStub.restore()
      accessStub.restore()
    })

    it('should resolve an access report on successful put operation', async () => {
      let url = 'http://www.gutenberg.org/10'
      let itemID = '10'
      let updated = '2019-01-01'
      let fileName = 'fileName'
      checkStub.resolves('dataObject')
      bufferStub.resolves('bufferObject')
      accessStub.returns({
        'status': 200,
        'code': 'accessibility'
      })

      let apiResp = nock('http://www.gutenberg.org')
        .get('/10')
        .reply(200, { 'message': 'Success' })

      let response = await Lambda.storeFromURL(url, itemID, updated, fileName)
      expect(checkStub).to.be.called
      expect(explodeStub).to.be.called
      expect(bufferStub).to.be.called
      expect(storeStub).to.be.called
      expect(accessStub).to.be.called
      expect(response['code']).to.equal('accessibility')
    })

    it('should resolve a status of existing if a file is found', async () => {

      let url = 'http://www.gutenberg.org/10'
      let itemID = '10'
      let updated = '2019-01-01'
      let fileName = 'fileName'

      checkStub.rejects('existing')
      let response = await Lambda.storeFromURL(url, itemID, updated, fileName)

      expect(checkStub).to.be.called
      expect(response['code']).to.equal('existing')
    })

    it('should throw a LambdaError if a parsing error occurs', () => {
      let url = 'http://www.gutenberg.org/10'
      let itemID = '10'
      let updated = '2019-01-01'
      let fileName = 'fileName'
      checkStub.resolves('dataObject')
      bufferStub.rejects('readError')

      let apiResp = nock('http://www.gutenberg.org')
        .get('/10')
        .reply(200, { 'message': 'Success' })

      Lambda.storeFromURL(url, itemID, updated, fileName).then((resp) => {
        console.log('hello')
      }).catch((err) => {
        expect(err['code']).to.equal('stream-to-buffer')
      })
    })
  })

  describe('runAccessCheck(zipData, itemID)', () => {
    let reportStub
    beforeEach(() => {
      reportStub = sinon.stub(AccessibilityChecker, 'getAccessibilityReport')
    })

    afterEach(() => {
      reportStub.restore()
    })

    it('should return 200 on successful report generation', async () => {
      reportStub.resolves({'data': 'reportData'})
      let response = await Lambda.runAccessCheck('data', '10')
      expect(reportStub).to.be.called
      expect(response['code']).to.equal('accessibility')
      expect(response['data']['data']).to.equal('reportData')
    })

    it('should return 500 on report generation failure', async () => {
      reportStub.rejects('error')
      try {
        let response = await Lambda.runAccessCheck('data', '10')
      } catch (err) {
        expect(err.status).to.equal(500)
        expect(err.code).to.equal('accessibility-report')
      }
    })
  })
})
