/* eslint-disable semi, no-unused-expressions, no-undef */
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import sinonChai from 'sinon-chai'
import { formatFileName } from '../src/helpers/fileNameParser'

chai.should()
chai.use(sinonChai)
chai.use(chaiAsPromised)
const { expect } = chai

describe('helpers/fileNameParser', () => {
  describe('formatFileName(fileName)', () => {
    it('should return parsed Gutenberg EPUB filenames', (done) => {
      const testFileName = 'http://gutenberg.org/hello/123456.epub.images'
      const parsedFileName = formatFileName(testFileName)
      expect(parsedFileName).to.equal('123456_images.epub')
      done()
    })

    it('should return parsed Gutenberg EPUB filenames with .noimages as well', (done) => {
      const testFileName = 'http://gutenberg.org/hello/9876.epub.noimages'
      const parsedFileName = formatFileName(testFileName)
      expect(parsedFileName).to.equal('9876_noimages.epub')
      done()
    })

    it('should return non-standard filenames as-is', (done) => {
      const testFileName = 'http://gutenberg.org/hello/otherEpubFormat.epub'
      const parsedFileName = formatFileName(testFileName)
      expect(parsedFileName).to.equal('otherEpubFormat.epub')
      done()
    })

    it('should reject urls without .epub extension', (done) => {
      const badFileName = 'http://gutenberg.org.ebook/actuallypdf123.pdf'
      try {
        formatFileName(badFileName)
      } catch (err) {
        expect(err.status).to.equal(500)
        expect(err.code).to.equal('regex-failure')
      }
      done()
    })
  })
})
