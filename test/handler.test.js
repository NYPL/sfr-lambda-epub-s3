/* eslint-disable semi, no-unused-expressions, no-undef */
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import sinon from 'sinon'
import sinonChai from 'sinon-chai'
import nock from 'nock'
import moment from 'moment'
import Lambda from '../index'
import ResHandler from '../src/responseHandlers'
import Parser from '../src/epubParsers'
import LambdaError from '../src/helpers/error'

chai.should()
chai.use(sinonChai)
chai.use(chaiAsPromised)
const { expect } = chai

describe('Handlers [index.js]', () => {
  describe('exports.handler', () => {
    let handlerStub
    let parseStub
    beforeEach(() => {
      handlerStub = sinon.stub(ResHandler, 'resultHandler')
      parseStub = sinon.stub(Lambda, 'parseRecords')
    })

    afterEach(() => {
      handlerStub.restore()
      parseStub.restore()
    })

    it('should return 500 if no records in array', () => {
      const event = {
        Records: [],
      }
      const callback = sinon.spy()
      Lambda.handler(event, null, callback)
      expect(handlerStub).to.be.called
      expect(parseStub).to.be.not.called
    })

    it('should return 500 if records is undefined or false', () => {
      const event = {}
      const callback = sinon.spy()
      Lambda.handler(event, null, callback)
      expect(handlerStub).to.be.called
      expect(parseStub).to.be.not.called
    })

    it('should call parse Records if we have items in the array', () => {
      const event = {
        Records: [{
          kinesis: {
            data: 'base64stuffhere',
          },
        }],
      }
      const callback = sinon.spy()
      Lambda.handler(event, null, callback)
      expect(handlerStub).to.be.not.called
      expect(parseStub).to.be.called
    })
  })

  describe('parseRecords(records)', () => {
    let readStub
    beforeEach(() => {
      readStub = sinon.stub(Lambda, 'parseRecord')
    })

    afterEach(() => {
      readStub.restore()
    })

    it('should call record parser for each record', async () => {
      const records = [
        {
          id: 1,
        }, {
          id: 2,
        },
      ]
      await Lambda.parseRecords(records)
      expect(readStub).to.be.calledTwice
    })
  })

  describe('parseRecord(record)', () => {
    let testRecord
    let testData
    let readStub
    let storeStub
    beforeEach(() => {
      testData = {
        url: 'http://www.gutenberg.org/ebooks/10.epub.images',
        id: '10',
        updated: moment().format(),
      }
      testRecord = {
        kinesis: {
          data: null,
        },
      }

      readStub = sinon.stub(Lambda, 'readFromKinesis')
      storeStub = sinon.stub(Lambda, 'storeFromURL')
    })

    afterEach(() => {
      readStub.restore()
      storeStub.restore()
    })

    it('should resolve response object with successful call', async () => {
      testRecord.kinesis.data = Buffer.from(JSON.stringify(testData)).toString('base64')

      readStub.returns(['url', 1, '2018-01-01', 'fileName', { data: 'block' }])
      storeStub.resolves({
        status: 200,
        code: 'store_success',
      })
      const resp = await Lambda.parseRecord(testRecord)
      expect(resp.status).to.equal(200)
      expect(resp.code).to.equal('store_success')
    })

    it('should throw error if file storage fails', async () => {
      testRecord.kinesis.data = Buffer.from(JSON.stringify(testData)).toString('base64')

      readStub.returns(['url', 1, '2018-01-01', 'fileName', { data: 'block' }])
      storeStub.throws(new LambdaError('Bad URL', {
        status: 500,
        code: 'buffer_error',
      }))

      try {
        Lambda.parseRecord(testRecord)
      } catch (err) {
        expect(err.status).to.equal(500)
        expect(err.code).to.equal('buffer_error')
      }
    })

    it('should resolve error if cannot read Kinesis object', async () => {
      testRecord.kinesis.data = Buffer.from(JSON.stringify(testData)).toString('base64')

      readStub.throws({
        status: 500,
        code: 'invalid_url',
      })
      try {
        Lambda.parseRecord(testRecord)
      } catch (err) {
        expect(err.status).to.equal(500)
        expect(err.code).to.equal('invalid_url')
      }
    })
  })

  describe('readFromKinesis(record)', () => {
    let testRecord
    let testData
    beforeEach(() => {
      testData = {
        data: null,
      }
      testRecord = {
        kinesis: {
          data: null,
        },
      }
    })

    it('should return data fields', () => {
      testData.data = {
        url: 'http://www.gutenberg.org/ebooks/10.epub.images',
        id: '10',
        updated: moment().format(),
      }
      testRecord.kinesis.data = Buffer.from(JSON.stringify(testData)).toString('base64')
      const results = Lambda.readFromKinesis(testRecord.kinesis.data)
      expect(results[0]).to.equal('http://www.gutenberg.org/ebooks/10.epub.images')
      expect(results[1]).to.equal('10')
      expect(results[2]).to.deep.equal(new Date(testData.data.updated))
      expect(results[3]).to.equal('10_images.epub')
    })

    it('should should transform 00000.epub.(no)images URLs', () => {
      testData.data = {
        url: 'http://www.gutenberg.org/ebooks/9999.epub.noimages',
        id: '9999',
        updated: moment().format(),
      }
      testRecord.kinesis.data = Buffer.from(JSON.stringify(testData)).toString('base64')
      const results = Lambda.readFromKinesis(testRecord.kinesis.data)
      expect(results[0]).to.equal('http://www.gutenberg.org/ebooks/9999.epub.noimages')
      expect(results[1]).to.equal('9999')
      expect(results[2]).to.deep.equal(new Date(testData.data.updated))
      expect(results[3]).to.equal('9999_noimages.epub')
    })

    it('should throw LambdaError if regex match fails', () => {
      testData.data = {
        url: 'http://www/gutenberg/org/notReal',
        id: 'notreal',
        updated: moment().format(),
      }
      testRecord.kinesis.data = Buffer.from(JSON.stringify(testData)).toString('base64')
      try {
        results = Lambda.readFromKinesis(testRecord.kinesis.data)
      } catch (err) {
        expect(err.status).to.equal(500)
        expect(err.code).to.equal('regex-failure')
      }
    })

    it('should prefer a supplied filename rather than one parsed from a URL', () => {
      testData.data = {
        url: 'http://www.somefile.com/epubs/1/epub',
        id: '1',
        updated: moment().format(),
        fileName: '1.epub'
      }
      testRecord.kinesis.data = Buffer.from(JSON.stringify(testData)).toString('base64')
      const results = Lambda.readFromKinesis(testRecord.kinesis.data)
      expect(results[0]).to.equal('http://www.somefile.com/epubs/1/epub')
      expect(results[1]).to.equal('1')
      expect(results[2]).to.deep.equal(new Date(testData.data.updated))
      expect(results[3]).to.equal('1.epub')
    })
  })

  describe('storeFromURL(url, itemID, updated, fileName)', () => {
    let explodeStub
    let bufferStub
    let storeStub
    let checkStub
    beforeEach(() => {
      checkStub = sinon.stub(Parser, 'checkForExisting')
      explodeStub = sinon.stub(Parser, 'epubExplode')
      bufferStub = sinon.stub(Parser, 'getBuffer')
      storeStub = sinon.stub(Parser, 'epubStore')
    })

    afterEach(() => {
      checkStub.restore()
      explodeStub.restore()
      bufferStub.restore()
      storeStub.restore()
    })

    it('should resolve an success status on successful put', async () => {
      const url = 'http://www.gutenberg.org/10'
      const itemID = '10'
      const updated = '2019-01-01'
      const fileName = 'fileName'
      checkStub.resolves('dataObject')
      explodeStub.resolves('success')
      bufferStub.resolves('bufferObject')
      storeStub.resolves('succeess')

      nock('http://www.gutenberg.org')
        .get('/10')
        .reply(200, { data: 'streamObject' })

      const response = await Lambda.storeFromURL(url, itemID, updated, fileName, { source: 'test' })
      expect(checkStub).to.be.called
      expect(explodeStub).to.be.called
      expect(bufferStub).to.be.called
      expect(storeStub).to.be.called
      expect(response.code).to.equal('success')
    })

    it('should resolve a status of existing if a file is found', async () => {
      const url = 'http://www.gutenberg.org/10'
      const itemID = '10'
      const updated = '2019-01-01'
      const fileName = 'fileName'
      const itemData = {
        source: 'test',
        drm: 'drm',
        rights_uri: 'rights_uri',
        measurements: [],
      }

      checkStub.rejects('existing')
      const response = await Lambda.storeFromURL(url, itemID, updated, fileName, itemData)

      expect(checkStub).to.be.called
      expect(response.code).to.equal('existing')
      expect(response.data.source).to.equal('test')
    })

    it('should throw a LambdaError if a parsing error occurs', () => {
      const url = 'http://www.gutenberg.org/10'
      const itemID = '10'
      const updated = '2019-01-01'
      const fileName = 'fileName'
      checkStub.resolves('dataObject')
      bufferStub.rejects('readError')

      nock('http://www.gutenberg.org')
        .get('/10')
        .reply(200, { message: 'Success' })

      Lambda.storeFromURL(url, itemID, updated, fileName).catch((err) => {
        expect(err.code).to.equal('stream-to-buffer')
      })
    })
  })
})
