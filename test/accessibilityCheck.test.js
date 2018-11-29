/* eslint-disable semi, no-unused-expressions */
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import sinon from 'sinon'
import sinonChai from 'sinon-chai'
import axios from 'axios'
import nock from 'nock'

import AccessibilityChecker from '../src/accessibilityCheck.js'

chai.should()
chai.use(sinonChai)
chai.use(chaiAsPromised)
const expect = chai.expect

describe('Accessibility Checker [accessibilityCheck.js]', () => {
  describe('getAccessibilityReport(url)', () => {

    it('should get a report from the Accessibility Report API', async () => {
      let apiResp = nock('http://10.229.7.85')
        .post('/generate_report')
        .reply(200, { 'data': 'Some Test Data' })
      let resp
      try{
        resp = await AccessibilityChecker.getAccessibilityReport({buf: 'fakeBuf'})
      } catch(err) {
        resp = err
      }
      expect(resp.data).to.equal('Some Test Data')
    })

    it('should get a throw an error if it does not get a report', async () => {
      let apiResp = nock('http://10.229.7.85')
        .post('/generate_report')
        .reply(500, { 'message': 'Report Failed' })
      let resp
      try{
        resp = await AccessibilityChecker.getAccessibilityReport({buf: 'fakeBuf'})
      } catch(err) {
        resp = err
      }
      expect(resp).to.be.instanceof(Error)
      expect(resp.message).to.equal('Request failed with status code 500')
    })
  })
})
