import LambdaError from './error'

/**
 * Regex to validate ePub URLs. Must contain an .epub extension
 * The first match group extracts the "filename", whatever follows the final slash in the URL path
 * The second match group checks for an additional file extension, this is used by Project Gutenberg
 */
const fileNameRegex = /^.+\/(.+)\.epub\.?([a-zA-Z]*)$/

/**
 * This method validates an ePub URL and extracts the filename from the address.
 * If the URL is found to contain an extra extension (such as Project Gutenberg's
 * .no/images extensions) it extracts this and inserts it in the returned filename
 *
 * This process ensures that valid .epub filenames are returned for all input sources.
 *
 * @param {string} url The URL of a ePub file to be validated
 *
 * @returns {string} A .epub filename extracted from the provided URL
 */
const formatFileName = (url) => {
  const urlMatch = fileNameRegex.exec(url)
  if (!urlMatch) {
    throw new LambdaError(`Failed to extract file from url ${url}`, {
      status: 500,
      code: 'regex-failure',
    })
  }
  const extraFileExtension = urlMatch[2] ? `_${urlMatch[2]}` : ''
  return `${urlMatch[1]}${extraFileExtension}.epub`
}

module.exports = {
  formatFileName,
}
