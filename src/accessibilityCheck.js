import axios from 'axios'

exports.getAccessibilityReport = (buf, instID, ident) => {
  return new Promise((resolve, reject) => {
    const jsonBuf = JSON.stringify(buf)
    const reportBlock = {
      instanceID: instID,
      identifier: ident,
      epubData: JSON.parse(jsonBuf),
    }
    axios({
      method: 'post',
      url: process.env.SFR_ACCESSIBILITY_API,
      data: reportBlock,
      maxContentLength: 52428890,
    }).then((response) => {
      resolve(response.data)
    }).catch((err) => {
      reject(err)
    })
  })
}
