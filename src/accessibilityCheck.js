import axios from 'axios'

const STARTING_SCORE = 10
const SCORE_DIVISOR = 4

exports.getAccessibilityReport = (buf) => {
  return new Promise((res, reject) => {
    let jsonBuf = JSON.stringify(buf)
    axios.post(process.env.SFR_ACCESSIBILITY_API, JSON.parse(jsonBuf)).then((response) => {
      res(response.data)
    }).catch((err) => {
      reject(err)
      return
    })
  })
}
