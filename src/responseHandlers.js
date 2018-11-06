import AWS from 'aws-sdk'

AWS.config.update({
    region: 'us-east-1',
    logger: process.stdout
})

var customKinEndpoint
if(process.env.AWS_KINESIS_ENDPOINT){
    customKinEndpoint = {
	endpoint: process.env.AWS_KINESIS_ENDPOINT
    }
}

const kinesis = new AWS.Kinesis(customKinEndpoint)

export const resultHandler = (handleResp) => {
    let outParams = {
        Data: JSON.stringify(handleResp),
        PartitionKey: process.env.AWS_KINESIS_STREAMID,
        StreamName: process.env.AWS_KINESIS_STREAMNAME
    }
    let kinesisOut = kinesis.putRecord(outParams).promise()
    kinesisOut.then((data) => {
        console.log("Wrote Result to Kinesis stream")
    }).catch((err) => {
        console.log("FAILED TO PUT TO KINESIS")
    })
}
