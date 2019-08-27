// Load the needed environment variables
require('dotenv').load();
// Load the AWS SDK for Node.js
var AWS = require('aws-sdk');
// Load fs for file management
var fs = require('fs');
// Create Base Object
var result = {};
var lambdas = [];
// Set the region 
AWS.config.update({region: process.env.aws_region});
// Set the Credentials
var credentials = new AWS.Credentials(process.env.aws_secret_key_id, process.env.aws_secret_access_id);
AWS.config.credentials = credentials;

// Create CloudWatch service object
var cw = new AWS.CloudWatch(process.env.aws_cloudwatch_api_version);
var lambda = new AWS.Lambda(process.env.aws_lambda_api_version);

var Json2csvParser = require('json2csv').Parser;

function formatData2csv(data, fieldList) {
    if (!data) { return null; }
    // console.log(`formatData2csv: ${fieldList}`);
    const json2csvParser = new Json2csvParser({ ...fieldList });
  
    return json2csvParser.parse(data);
}

function logaConsole(dados, chamada) {
    if (process.env.console_log=='true') {
       if (!dados) {
            console.log("===>"+Date()+"===>"+chamada);    
        } else {
            console.log("===>"+Date()+"===>"+chamada+" ==> "+JSON.stringify(dados));
        }
    }
}

result.lambdas = lambdas;

logaConsole("","Getting list of Lambdas");
  lambda.listFunctions(function(err,data){
    if (err) console.log(err, err.stack);
    else {
        logaConsole(data.Functions.length,"# of Lambda Found");
        data.Functions.forEach( function (item, index) {
            var functionName = item.FunctionName;
            var params = {
                "StartTime" : new Date(process.env.collection_start_time) , /*required*/
                "EndTime" : new Date(process.env.collection_end_time) , /* required */            
                "MetricDataQueries": [ /* required */
                        {
                          "Id": "m1",
                          "MetricStat": {
                            "Metric": {
                              "Namespace": "AWS/Lambda",
                              "MetricName": "Invocations",
                              "Dimensions": [
                                {
                                  "Name": "FunctionName",
                                  "Value": functionName
                                }
                              ]
                            },
                            "Period": process.env.grouping_period_in_minutes * 60,
                            "Stat": "SampleCount"
                          }
                        }
                ]
              };
            
            var cw = new AWS.CloudWatch(process.env.aws_cloudwatch_api_version);
            cw.getMetricData(params, function(err, data) {
                if (err) console.log(err, err.stack); // an error occurred
                else     {
                    data.MetricDataResults.forEach(function( item, index){
                    logaConsole("","Getting executions for ==> "+functionName.valueOf());
                    var linhas = item.Timestamps.length;
                    var i = 0;
                    for (i=0; i<linhas; i++){
                        var entrada = {
                            "Name": functionName,
                            "Timestamps":item.Timestamps[i],
                            "Values":item.Values[i]
                        };
                        //logaConsole(entrada,"Linha que deve ser incluída no resultado");
                        result.lambdas.push(entrada);
                    }
                    //logaConsole(result,"Result Populado");
                    });
                    fs.writeFile(process.env.base_output_dir+process.env.results_lambda_file_name, formatData2csv(result.lambdas,{fields:["Name","Timestamps","Values"]}), function(err) {
                        if (err) {
                            console.log(err);
                        }
                    });
                    
                }           // successful response
              });
        });
    }
  });