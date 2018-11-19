/* eslint-disable semi, no-unused-expressions */
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import sinon from 'sinon'
import sinonChai from 'sinon-chai'
import nock from 'nock'
import Lambda from '../index.js'
import ResHandler from '../src/responseHandlers.js'
import Parser from '../src/epubParsers.js'
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
    let testRecord, testData, checkStub, explodeStub, bufferStub
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

      checkStub = sinon.stub(Parser, 'checkForExisting')
      explodeStub = sinon.stub(Parser, 'epubExplode')
      bufferStub = sinon.stub(Parser, 'getBuffer')

      let gutenbergResp = nock('http://www.gutenberg.org')
        .persist()
        .get(/\/*/)
        .reply(200, { 'data': 'Some Test Data' })
    })

    afterEach(() => {
      checkStub.restore()
      explodeStub.restore()
      bufferStub.restore()
    })

    it('should return 500 if URL is invalid/unexpected', () => {
      testData['url'] = 'http://www/gutenberg/org/notReal'
      testRecord['kinesis']['data'] = Buffer.from(JSON.stringify(testData)).toString('base64')

      let resp = Lambda.parseRecord(testRecord)
      expect(resp['status']).to.equal(500)
      expect(resp['code']).to.equal('Regex Failure')
    })

    it('should return existing message for non-modifed record', async () => {
      testData['updated'] = '1990-01-01'
      testRecord['kinesis']['data'] = Buffer.from(JSON.stringify(testData)).toString('base64')

      checkStub.rejects('Out-of-date-file!')
      try {
        await Lambda.parseRecord(testRecord)
      } catch (e) {
        expect(e['status']).to.equal(200)
        expect(e['code']).to.equal('existing')
      }
    })

    it('should call ePubExplode, getBuffer and epubStore for success', async () => {
      testRecord['kinesis']['data'] = Buffer.from(JSON.stringify(testData)).toString('base64')

      checkStub.resolves('status')
      bufferStub.resolves('A Fake Buffer')
      explodeStub.resolves('Exploded!')
      let storeStub = sinon.stub(Parser, 'epubStore')

      await Lambda.parseRecord(testRecord)
      expect(explodeStub).to.be.called
      expect(bufferStub).to.be.called
      expect(storeStub).to.be.called

      storeStub.restore()
    })

    it('should return 500 if it cannot load a buffer from provided URL', async () => {
      testRecord['kinesis']['data'] = Buffer.from(JSON.stringify(testData)).toString('base64')

      checkStub.resolves('status')
      explodeStub.resolves('Exploded!')
      bufferStub.rejects('Buffer Fail!')

      try {
        await Lambda.parseRecord(testRecord)
      } catch (e) {
        expect(e['status']).to.equal(500)
        expect(e['code']).to.equal('Stream-to-Buffer Error')
      }

      explodeStub.restore()
      bufferStub.restore()
    })
  })
})
