# Storing ePub files in s3 for ResearchNow

[![GitHub version](https://badge.fury.io/gh/NYPL%2Fsfr-lambda-epub-s3.svg)](https://badge.fury.io/gh/NYPL%2Fsfr-lambda-epub-s3) [![Build Status](https://travis-ci.org/NYPL/sfr-lambda-epub-s3.svg?branch=development)](https://travis-ci.org/NYPL/sfr-lambda-epub-s3)

This is a Lambda that writes ePub files to an s3 bucket and returns relevant metadata and URLs to the stored files. It reads from a Kinesis stream of URLs and writes out to another stream.

## Process
### Lambda steps
This lambda applies several steps to the storage and processing of the ePub files
1. It checks if the file exists, and if so, if it was last modified before the version passed to the Lambda. If a current version already exists, skip processing and return a status message stating so
2. If we are ingesting a new/updated file, first explode (unzip) the .epub file and store the results within a directory. While many individual files are created during this process, only the link to the content.opf file is returned to the Kinesis stream as it is the access point for the file
3. Store the zipped .epub file as-is
4. Pass the zipped file data stream to the Daisy Ace report maker (running as an API on an ec2 instance to generate an accessibility report
5. Return the results of this process (or an error if the ingest process encountered a failure at any point) to a Kinesis stream

### Input Stream
The input stream is configured to expect several fields
- URL
- Date Updated
- RowID from the postgresql database
- File Size

### Output Stream
- RowID
- s3 URL
- s3 Type (either 'archive' for zipped .epub or 'explMain' for content.opf file)
- Date Updated
- Status Message
- MD5 Hash (from s3 eTag, see below)

#### Accessibility Report Output
The accessibility reports are generated asynchronously (so that they don't block the s3 storage process) so the reports are generated separately for the output stream. They include:
- RowID
- Ace Version
- Report Timestamp
- Raw JSON output of Ace Report
- # of violations summary (critical, serious, moderate, minor)


#### Note on md5 hash
The hash of the file (generally only relevant for the archived .epub) is taken from the automatically generated "eTag" from s3. As noted in the [s3 documentation](https://docs.aws.amazon.com/AmazonS3/latest/API/RESTCommonResponseHeaders.html) any file stored by a normal putObject request has an etag that is generated through an md5 hash of the file. If multipart upload is used or the file is encrypted, then this does not hold true. This allows us to rely on the etag for fixity checks for now, but it must be kept in mind if other upload processes are used, or if Amazon changes how etags are calculated (however unlikely that may be)

## Deployment
This Lambda can be deployed using node-lambda and the scripts included in the package.json. It should be deployed to a Lambda of 256MB or larger as the 128MB size can lead to timeouts. Specific deployment instructions

1. Set all environemnt variables in  the relevant config/\*.env file.
2. Run `npm run test` and `npm run lint`
3. Run `npm run deploy-[intended_env]` where intended_env is where the code should be deployed

Alternatively, the code can be built locally and uploaded manually to AWS Lambda. To do so, follow steps 1 and 2 above and then:

3. Run `npm run clean` to remove any local files (to ensure a clean build)
4. Run `npm run build` to build a local copy
5. Upload the resulting file in the `build` directory, to AWS to update the Lambda function

## Testing
Testing is done via sinon and mocha. To run the test suite run `npm run test`. To generate a coverage report run `npm run coverage`

## Dependencies
- aws-sdk @ 2.348.0
- axios @ 0.18.0
- lambda-env-vars @ 0.4.0
- moment @ 2.22.2
- unzip-stream @ 0.3.0
