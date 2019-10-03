const fileNameRegex = /([0-9]+)\.epub\.((?:no)?images)$/

const formatFileName = fileName => fileName.replace(fileNameRegex, '$1_$2.epub')

module.exports = {
  formatFileName,
}
