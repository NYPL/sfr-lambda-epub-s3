/* eslint-disable semi, no-unused-expressions */
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import sinon from 'sinon'
import sinonChai from 'sinon-chai'
import Lambda from '../index.js'
import ResHandler from '../src/responseHandlers.js'
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
})
