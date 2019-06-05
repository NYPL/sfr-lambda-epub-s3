/* eslint-disable semi, no-unused-expressions, no-undef */
import chai from 'chai'
import sinon from 'sinon'
import chaiAsPromised from 'chai-as-promised'
import sinonChai from 'sinon-chai'

import AccessibilityChecker from '../src/accessibilityCheck'
import LambdaError from '../src/helpers/error'
import ResponseHandlers from '../src/responseHandlers'

chai.should()
chai.use(sinonChai)
chai.use(chaiAsPromised)
const { expect } = chai

describe('Accessibility Checker [accessibilityCheck.js]', () => {
  describe('runAccessCheck(fileKey, instanceID, fileName, source)', () => {
    let createStub
    beforeEach(() => {
      createStub = sinon.stub(AccessibilityChecker, 'createAccessibilityReport')
    })

    afterEach(() => {
      createStub.restore()
    })

    it('should create an accessibility report request', async () => {
      createStub.resolves('sqs_success')
      const accessOut = await AccessibilityChecker.runAccessCheck('testKey', 1, 'testFile', 'test')
      expect(accessOut).to.equal('sqs_success')
    })

    it('should raise an error if a request cannot be created', async () => {
      createStub.throws('Test Error')
      try {
        await AccessibilityChecker.runAccessCheck('testKey', 1, 'testFile', 'test')
      } catch (e) {
        expect(e).to.be.instanceof(LambdaError)
        expect(e.code).to.equal('accessibility-report')
      }
    })
  })

  describe('createAccessibilityReport(key, instID, ident', () => {
    let sqsStub
    beforeEach(() => {
      sqsStub = sinon.stub(ResponseHandlers, 'sqsHandler')
    })

    afterEach(() => {
      sqsStub.restore()
    })

    it('should resolve success response from SQS service', async () => {
      sqsStub.returns('sqs_send_success')
      const sendResponse = await AccessibilityChecker.createAccessibilityReport('testKey', 1, 'testIdent')
      expect(sendResponse).to.equal('sqs_send_success')
    })

    it('should reject with an error message on failure', async () => {
      sqsStub.throws('SQS Error')
      try {
        await AccessibilityChecker.createAccessibilityReport('testKey', 1, 'testIdent')
      } catch (e) {
        expect(e).to.be.instanceof(Error)
      }
    })
  })
})
