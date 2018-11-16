import ace from '@daisy/ace'
import fs from 'fs'
import { resolve } from 'path'

const STARTING_SCORE = 10
const SCORE_DIVISOR = 4

exports.runAccessibilityReport = async (buf) => {
  return new Promise(async (res, reject) => {
    let tmpFile, report
    try{
      tmpFile = await exports.saveTmpFile(buf)
    } catch(e) {
      reject(e)
      return
    }

    let aceOpts = {
      cwd: __dirname,
      outdir: null,
      tmpdir: null,
      verbose: false,
      silent: true
    }

    try{
      report = await ace(tmpFile, aceOpts)
    } catch(e) {
      reject(e)
      return
    }

    let reportSummary = exports.parseReport(report)
    res(reportSummary)

  })
}

exports.saveTmpFile = (buf) => {
  return new Promise((res, reject) => {
    let tmpFile = './tmp/' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    fs.writeFile(tmpFile, buf, (err) => {
      if (err) reject(err)
      let absPath = resolve(tmpFile)
      res(absPath)
    })
  })
}

exports.parseReport = (report) => {
  let mainReport = report[1]
  let assertions = mainReport['assertions']
  let timeRun = mainReport['dct:date']
  let aceVersion = mainReport['earl:assertedBy']['doap:release']['doap:revision']
  let assertionOut = exports.parseAssertions(assertions)
  let vioObj = {}
  assertionOut['violations'].forEach((value, key) => {
    vioObj[key] = value
  })
  return {
    'json': mainReport,
    'aceVersion': aceVersion,
    'timestamp': timeRun,
    'score': assertionOut['score'],
    'violations': vioObj
  }
}

exports.parseAssertions = (assertions) => {
  let output = {
    'score': 0,
    'violations': new Map([
      ['critial', 0],
      ['serious', 0],
      ['moderate', 0],
      ['minor', 0]
    ])
  }
  assertions.map((assertion) => {
    let tests = assertion['assertions']
    tests.map((test)=> {
      let errType = test['earl:test']['earl:impact']
      let newCount = output['violations'].get(errType)
      newCount++
      output['violations'].set(errType, newCount)
    })
  })

  let score = exports.calculateScore(output['violations'])
  if (score > 0) output['score'] = score
  return output
}

exports.calculateScore = (violations) => {
  let score = STARTING_SCORE
  let i = 0
  violations.forEach((value, key) => {
    score -= value/(Math.pow(SCORE_DIVISOR, i))
    i++
  })

  return score
}
