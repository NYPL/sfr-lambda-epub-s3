import axios from 'axios'

exports.getAccessibilityReport = (buf) => {
  return new Promise((resolve, reject) => {
    let jsonBuf = JSON.stringify(buf)
    axios.post(process.env.SFR_ACCESSIBILITY_API, JSON.parse(jsonBuf)).then((response) => {
      resolve(response.data)
    }).catch((err) => {
      reject(err)
    })
  })
}
