export const resultHandler = (handleResp) => {
    // TODO Pass the results to SQS/Kinesis/postgresql
    console.log(handleResp)
    if (handleResp.status !== 200){
        console.log("ERROR")
    }
}
