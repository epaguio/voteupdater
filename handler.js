'use strict';
var AWS = require("aws-sdk");
const format = require('string-format');
format.extend(String.prototype, {});

// s3 cached object
var s3 = null;
var isParallel = false;
var seedValue = 0;
var prefixListing = "";
var numTest = 1;

var s3params = {
    bucketName: "elws-dev-apcapdev-use1-objects",
    s3Key: "BACKUP/mongodb/{electionDate}/{statePostal}/{level}_{reportingunitId}_{raceId}.json"
};

var originalLog = console.log;
// Overwriting
console.log = function () {
    var args = [].slice.call(arguments);
    originalLog.apply(console.log,[getCurrentDateString()].concat(args));
};
// Returns current timestamp
function getCurrentDateString() {
    return (new Date()).toISOString() + ' ::';
};

// this function saves the string to S3 and returns the result of the operation to the callback function
function saveTextToS3(params, textToSave, cb) {
    if (s3 == null)
        s3 = new AWS.S3();
    s3.putObject({
        Bucket: params.bucketName,
        Key: params.s3Key,
        Body: textToSave
    }, function (err, data) {
        if (err) {
        console.log(new Date().toTimeString().substring(0,8), err);
        cb(err);
        }
        else {
        params.result = data;
        // console.log(new Date().toTimeString().substring(0,8),"Successfully uploaded data to: ", params.s3Key);
        cb(null, params);
        }
    });
}

// this function loads a file defined by the parameters and returns the string to the callback function
function loadTextFromS3(params, cb) {
    if (s3 == null)
        s3 = new AWS.S3();
    s3.getObject({
        Bucket: params.bucketName,
        Key: params.s3Key
    }, (err, data) => {
        if (err) {
        console.error(err.message, params.s3Key);
        if (cb)
            cb(err);
        }
        else {
            var jsonStr = Buffer.from(data.Body).toString("utf8");
            if (cb)
                cb(null, jsonStr);
        }
    });
}

function listObjectFromS3(params, cb, filterPattern, requestLimit) {
    var keys = [];
  
    // we will aggregate the contects placed in params
    if (params.data) {
      keys = params.data;
    }
  
    if (s3 == null)
      s3 = new AWS.S3();
  
    // s3.listObjectsV2({
    //   Bucket: params.bucketName,
    //   Delimiter: '/',
    //   Prefix: params.folder
    // }, (e, data) => {
    s3.listObjectsV2({ Bucket: params.Bucket, Prefix: params.Prefix, ContinuationToken: params.ContinuationToken }, (e, data) => {
      if (e) {
        console.error(e.message);
        cb(e);
      }
      else {
        var fList = (filterPattern != undefined && filterPattern != null) ? data.Contents.filter((content) => { var pat = new RegExp(filterPattern); return pat.test(content.Key); }) : data.Contents;
        console.log("Results length:", data.Contents.length, "Filtered listing contains:", fList.length, "Filter:", filterPattern);
        if (data.IsTruncated) {
          //console.log(data);
          params['ContinuationToken'] = data.NextContinuationToken
          keys = keys.concat(fList);
          params['data'] = keys;
          if (requestLimit != null && !isNaN(requestLimit) && keys.length > requestLimit) {
            data.Contents = keys;
            cb(null, data);
          }
          else
            listObjectFromS3(params, cb, filterPattern, requestLimit);
        }
        else {
          keys = keys.concat(fList);
          data.Contents = keys;
          cb(null, data);
        }
      }
    });
}

function emptyS3Directory(params, filterPattern, cb) {
    var deletedCount = 0;
  
    if (params.deletedCount)
      deletedCount = params.deletedCount;
  
    if (s3 == null)
      s3 = new AWS.S3();
    console.log("deleting objects from:", params);
  
    s3.listObjectsV2({ Bucket: params.Bucket, Prefix: params.Prefix, ContinuationToken: params.ContinuationToken }, (e, data) => {
      if (e) {
        console.error(e.message);
        cb(e);
      }
      else if (data.Contents.length > 0) {
        const deleteParams = {
          Bucket: params.Bucket,
          Delete: { Objects: [] }
        };
        var fList = (filterPattern != undefined && filterPattern != null) ? data.Contents.filter((content) => { var pat = new RegExp(filterPattern); return pat.test(content.Key); }) : data.Contents;
        fList.forEach(({ Key }) => {
          deleteParams.Delete.Objects.push({ Key });
        });
        deletedCount += fList.length;
        console.log("found {0} items, filtered to delete {1} items.., first item: {2}".format(data.Contents.length, fList.length, JSON.stringify(deleteParams.Delete.Objects[0])));
  
        if (fList.length > 0)
          s3.deleteObjects(deleteParams, (derr, ddata) => {
            if (derr) { cb(derr); return; }
  
            if (data.IsTruncated) {
              //console.log(data);
              params['ContinuationToken'] = data.NextContinuationToken
              params['deletedCount'] = deletedCount;
              emptyS3Directory(params, filterPattern, cb);
            }
            else
              cb(null, { deleted: deletedCount });
          });
        else if (data.IsTruncated) {
          //console.log(data);
          params['ContinuationToken'] = data.NextContinuationToken
          params['deletedCount'] = deletedCount;
          emptyS3Directory(params, filterPattern, cb);
        }
        else
          cb(null, { deleted: deletedCount });
  
      }
      else {
        console.log("Nothing to delete, folder is empty!");
        cb(null, { deleted: deletedCount })
      }
    });
  
  }

function getArgs () {
    const args = {};
    process.argv
        .slice(2, process.argv.length)
        .forEach( arg => {
        // long arg
        if (arg.slice(0,2) === '--') {
            const longArg = arg.split('=');
            const longArgFlag = longArg[0].slice(2,longArg[0].length);
            const longArgValue = longArg.length > 1 ? longArg[1] : true;
            args[longArgFlag] = longArgValue;
        }
        // flags
        else if (arg[0] === '-') {
            const flags = arg.slice(1,arg.length).split('');
            flags.forEach(flag => {
            args[flag] = true;
            });
        }
    });
    return args;
  }
  
function processJsonVotes(idx, allFiles, inc, cb) {
    var voteFile = allFiles[idx - 1].Key;
    var outFile = (voteFile.search("_zeros.json")>0) ? voteFile.replace("_zeros.json", "_edwin.json") : voteFile;
    loadTextFromS3({ bucketName : s3params.bucketName, s3Key: voteFile }, (err, data) => {
        if (err == null) {
            var jsonObj = null;
            try {
                jsonObj = JSON.parse(data);
            } catch (ex) { console.error("Invalid JSON File({0}), skipping...".format(voteFile)); jsonObj = null }
            //var jsonObj = JSON.parse(data);
            if (jsonObj != null) {
                var totPrec = parseInt(jsonObj[0].totalPrecincts);
                var expVote = parseInt(jsonObj[0].expectedVoters);
                var maxVotePerIteration = Math.floor((expVote*(inc/100))/numTest);
                // var cndIdx = 1;
                var totVotes = 0;
                var parentVotes = 0;
                var nextVoteCnt = 0

                console.log("Votes to divide for all candidate on this iteration: ", maxVotePerIteration)
                jsonObj[0].candidates.forEach(element => {
                    if (element.parentID == undefined) {
                        nextVoteCnt = Math.floor(Math.random() * maxVotePerIteration)
                        maxVotePerIteration -= nextVoteCnt;
                        element.voteCount = parseInt(element.voteCount) + nextVoteCnt;
                        parentVotes = parseInt(element.voteCount);
                        totVotes = totVotes + parentVotes;
                        console.log("{0}. candidate {1}, votes = {2}, cumulative total = {3}".format(idx, element.candidateName, element.voteCount, totVotes));
                    }
                    else {
                        element.voteCount = Math.floor(Math.random() * parentVotes);
                        console.log("{0}. candidate {1}, votes = {2}".format(idx, element.candidateID, element.voteCount));
                    }
                    // element.voteCount = parseInt(element.voteCount) + seedValue + (inc * cndIdx++);
                    
                    
                });

                if (totVotes > expVote)
                    jsonObj[0].precinctsReporting = totPrec;
                else
                    jsonObj[0].precinctsReporting = Math.round((totVotes / expVote) * totPrec);

                var strPayload = JSON.stringify(jsonObj);
                // if the increment is 0, then we don't change anything simply save.
                if (inc == 0)
                    strPayload = data;
                console.log("{0}. County {1}, precincts reporting = {2}".format(idx, jsonObj[0].countyName, jsonObj[0].precinctsReporting));
                // console.log("File {0} contains {1} bytes, resulting file -> {2}".format(voteFile, data.length, outFile));
                saveTextToS3({ bucketName : s3params.bucketName, s3Key: outFile }, strPayload, (e, d) => {
                    if (e == null) {
                        console.log("{0}. Updated file: {1}".format(idx, outFile));
                    }
                    else {
                        console.error("{0}. Failed to save updates: {1}".format(idx, e));
                    }
                    if (idx < allFiles.length && !isParallel)
                        processJsonVotes(idx + 1, allFiles, inc, cb);
                    else
                        cb(idx);
                });
            }
        }
        else
            console.error("Failed to load JSON file: {0}, error: {1}".format(voteFile, err));
    });
}

function processS3Files(filter, inc, delS, numT, cb) {
    listObjectFromS3({
        Bucket: s3params.bucketName,
        Prefix: filter
      }, (err, data) => {
        if (err == null) {
            if (data.Contents.length > 0) {
                console.log("==============================================");
                console.log("FOUND {0} files using key {1}, iteration = {2}".format(data.Contents.length, prefixListing, numT));
                console.log("==============================================");
                if (isParallel) {
                    for (var i=1; i<=data.Contents.length; i++) {
                        processJsonVotes(i, data.Contents, inc, (o) => {});
                    }
                    if (numT > 1) {
                        setTimeout(processS3Files, (1000*delS), filter, inc, delS, numT - 1, cb);
                    }
                    else
                        cb(i);                    
                }
                else
                    processJsonVotes(1, data.Contents, inc, (i) => {
                        if (numT > 1) {
                            setTimeout(processS3Files, (1000*delS), filter, inc, delS, numT - 1, cb);
                        }
                        else
                            cb(i);
                    });
            }
            else {
                console.log("==============================================");
                console.log("First time to update votes, will use zero files...");
                console.log("==============================================");
                listObjectFromS3({
                    Bucket: s3params.bucketName,
                    Prefix: prefixListing
                  }, (errZ, dataZ) => {
                    if (errZ == null) {
                        if (dataZ.Contents.length > 0) {
                            if (isParallel) {
                                for (var i=1; i<=dataZ.Contents.length; i++) {
                                    processJsonVotes(i, dataZ.Contents, inc, (o) => {});
                                }
                                if (numT > 1) {
                                    setTimeout(processS3Files, (1000*delS), filter, inc, delS, numT - 1, cb);
                                }
                                else
                                    cb(i);                                
                            }
                            else
                                processJsonVotes(1, dataZ.Contents, inc, (i) => {
                                    if (numT > 1) {
                                        setTimeout(processS3Files, (1000*delS), filter, inc, delS, numT - 1, cb);
                                    }
                                    else
                                        cb(i);
                                });                 
                        }
                        else {
                            console.error("No ZERO Files Found! Please use Webscrape UI to generate ZERO files!");
                        }
                    }
                    else {
                        console.error("Error in fetching the ZERO files...", errZ);l
                    }
                }, "_zeros.json", 1000);
            }      
        }
        else
            console.error(err);        
      }, "_edwin.json", 1000 );
}

console.log("Webscrape VoteCount updater...");
console.time("Total Time");
const args = getArgs();
console.log(args);
if (args["F"] != undefined) {
    prefixListing = args["F"];
    var isCleanup = (args["C"] != undefined)? true : false;
    var increments = (args["I"] != undefined)? parseInt(args["I"]) : 1;
    var delayInSecs = (args["D"] != undefined)? parseInt(args["D"]) : 1;
    numTest = (args["N"] != undefined)? parseInt(args["N"]) : 1;
    isParallel = (args["P"] != undefined)? true : false;
    seedValue = (args["S"] != undefined)? parseInt(args["S"]) : 0;

    if (args["E"] != undefined) {
        var envStr = args["E"].toString();
        if (args["R"] != undefined) {
            var regStr = args["R"].toString();
            s3params.bucketName = "elws-{0}-apcapdev-{1}-objects".format(envStr.toLowerCase(),regStr.toLowerCase());
        }
        else
            s3params.bucketName = "elws-{0}-apcapdev-use1-objects".format(envStr.toLowerCase());
    }
    console.log("Logging output to bucket:", s3params.bucketName);
    
    if (isCleanup) {
        var filterPattern = args["C"];
        emptyS3Directory({ Bucket: s3params.bucketName, Prefix: prefixListing }, filterPattern, (e,d) => {
            console.timeEnd("Total Time");
        });
    }
    else {
        processS3Files(prefixListing, increments, delayInSecs, numTest, (i) => {
            console.timeEnd("Total Time");
        })
    }
}

console.log("Done");