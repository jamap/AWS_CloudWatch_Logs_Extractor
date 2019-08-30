// Load the needed environment variables
require('dotenv').load();
// Load the AWS SDK for Node.js
var AWS = require('aws-sdk');
// Load fs for file management
var fs = require('fs');
// Create Base Object
var result = {};
var queues = [];
// Set the region 
AWS.config.update({ region: process.env.aws_region });
// Set the Credentials
var credentials = new AWS.Credentials(process.env.aws_secret_key_id, process.env.aws_secret_access_id);
AWS.config.credentials = credentials;

// Create CloudWatch service object
var cw = new AWS.CloudWatch(process.env.aws_cloudwatch_api_version);
var sqs = new AWS.SQS(process.env.aws_sqs_api_version);

var Json2csvParser = require('json2csv').Parser;

function formatData2csv(data, fieldList) {
  if (!data) { return null; }
  // console.log(`formatData2csv: ${fieldList}`);
  const json2csvParser = new Json2csvParser({ ...fieldList });

  return json2csvParser.parse(data);
}

function logaConsole(dados, chamada) {
  if (process.env.console_log == 'true') {
    if (!dados) {
      console.log("===>" + Date() + "===>" + chamada);
    } else {
      console.log("===>" + Date() + "===>" + chamada + " ==> " + JSON.stringify(dados));
    }
  }
}

result.queues = queues;

logaConsole("", "Getting list of SQSs");
sqs.listQueues((err, data) => {
  if (err) {
    console.log(err, err.stack);
  }
  else {
    logaConsole(data.QueueUrls.length, "# of SQSs Found");
    data.QueueUrls.forEach((item, index) => {
      let queueUrl = item.valueOf();
      sqs.getQueueAttributes({
        QueueUrl: queueUrl,
        AttributeNames: ['QueueArn']
      }, (err, data) => {
        if (err) {
          console.log(err, err.stack) ;
        }
        else {
          //let queueName = data.Attributes.QueueArn.split(':')[data.Attributes.QueueArn.split(':').length - 1]
          let queueName = queueUrl.split('/')[queueUrl.split('/').length - 1];
          var params = {
            "StartTime": new Date(process.env.collection_start_time), /*required*/
            "EndTime": new Date(process.env.collection_end_time), /* required */
            "MetricDataQueries": [ /* required */
              {
                "Id": "m1",
                "MetricStat": {
                  "Metric": {
                    "Namespace": "AWS/SQS",
                    "MetricName": "ApproximateNumberOfMessagesVisible",
                    "Dimensions": [
                      {
                        "Name": "QueueName",
                        "Value": queueName
                      }
                    ]
                  },
                  "Period": process.env.grouping_period_in_minutes * 60,
                  "Stat": "Sum"
                }
              }
            ]
          };
          logaConsole(params, "Getting executions for ==> " + queueName.valueOf());
          var cw = new AWS.CloudWatch(process.env.aws_cloudwatch_api_version);
          cw.getMetricData(params, function (err, data) {
            if (err) console.log(err, err.stack); // an error occurred
            else {
              data.MetricDataResults.forEach(function (item, index) {
                logaConsole("", "Getting executions for ==> " + queueName.valueOf());
                for (i = 0; i < item.Timestamps.length; i++) {
                  var entrada = {
                    "Name": queueName,
                    "Timestamps": item.Timestamps[i],
                    "Values": parseInt(item.Values[i])
                  };
                  logaConsole(entrada, "Linha que deve ser incluída no resultado");
                  result.queues.push(entrada);
                }
                logaConsole(result, "Result Populado");
              });
              fs.writeFile(process.env.base_output_dir + process.env.results_sqs_file_name, formatData2csv(result.queues, { fields: ["Name", "Timestamps", "Values"] }), function (err) {
                if (err) {
                  console.log(err);
                }
              });

            }           // successful response
          });
        }
      });
    });
  }
});
