var formidable = require('../lib/formidable')
  , fs = require('fs')
  , http = require('http')
  , mime = require('../lib/mime/mime')
  , nexpect = require('../lib/nexpect/lib/nexpect').nspawn
  , path = require('path')
  , sys = require('sys');

var PORT = 4444
  , HOST_NAME = 'localhost'
  , SERVER_URL = 'http://' + HOST_NAME + ':' + PORT // the address at which the segmented files and index files will be made available
  , SEGMENTER_LOCATION = path.join(__dirname, '..', 'segmenter/segmenter') // the location of the segmenter binary
  , SEGMENT_DURATION = 5 // the length of each segment, in seconds
  , WEB_ROOT = '/streams/'
  , HTTP_PREFIX = SERVER_URL + WEB_ROOT // prefix, used by segmenter
  , STREAM_OUTPUT_DIR = path.join(__dirname, '..', 'streams/') // directory to store all stream-related files
  , PROFILES_LOCATION = path.join(__dirname, '..', 'profiles.json') // location where the encoding profiles are stored
  , profiles = JSON.parse(fs.readFileSync(PROFILES_LOCATION))

// http://stackoverflow.com/questions/610406/javascript-printf-string-format/3620861#3620861
String.prototype.format = function() {
  var formatted = this;
  for (arg in arguments) {
    formatted = formatted.replace("{" + arg + "}", arguments[arg]);
  }
  return formatted;
};

function getCommandsForAllActiveProfiles(inputFileName) {
  var commands = [];
  profiles.enabled.forEach(function(bitRate) {
    commands.push({
        'ffmpeg': createFFmpegCommand(profiles.command, inputFileName, bitRate)
      , 'segmenter': createSegmenterCommand(inputFileName, bitRate)
      , 'bitRate': bitRate
    });
  });
  console.log(sys.inspect(commands));
  console.log("\n")
  return commands;
}

function getIndexFilesForAllActiveProfiles(inputFileName) {
  var indexFiles = [];
  profiles.enabled.forEach(function(bitRate) {
    indexFiles.push({
        'url': [
          HTTP_PREFIX
        , createM3U8IndexFileName(inputFileName, bitRate)
        ].join('')
      , 'bitRate': bitRate
    });
  });
  console.log(sys.inspect(indexFiles));
  console.log("\n")
  return indexFiles;
}

function createTempOutputFileName(inputFileName, bitRate) {
  return [inputFileName, '_', bitRate].join('');
}

function createMPEGTSPrefix(inputFileName, bitRate){
  return [inputFileName.split('/').pop(), '_', bitRate, '_ts'].join('');
}

function createM3U8IndexFileName(inputFileName, bitRate){
  return [inputFileName.split('/').pop(), '_', bitRate, '_stream.m3u8'].join('');
}

function createFFmpegCommand(command, inputFileName, bitRate) {
  var tempOutputFile = createTempOutputFileName(inputFileName, bitRate);
  fullCommand = command.format(inputFileName, bitRate, bitRate, bitRate, tempOutputFile);
  return fullCommand;
}

function createSegmenterCommand(inputFileName, bitRate) {
  var command = [
     SEGMENTER_LOCATION
   , createTempOutputFileName(inputFileName, bitRate)
   , SEGMENT_DURATION
   , createMPEGTSPrefix(inputFileName, bitRate)
   , createM3U8IndexFileName(inputFileName, bitRate)
   , HTTP_PREFIX
   ].join(' ');
   return command;
}

function writeVariableBitRateIndexFile(inputFileName, indexFiles) {
  var fileName = [STREAM_OUTPUT_DIR, inputFileName.split('/').pop(), '_var_stream.m3u8'].join('')
    , contents = ['#EXTM3U\n'];

  indexFiles.forEach(function(file) {
    contents.push('#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH='+file.bitRate+'\n'+file.url+'\n');
  })

  fs.writeFileSync(fileName, contents.join(''));
  return fileName.split('/').pop();
}

function handleUpload(req, res) {
  var form = new formidable.IncomingForm();
  form.parse(req, function(err, fields, files) {
    var inputFileName = files.upload.path
      , commands = getCommandsForAllActiveProfiles(inputFileName)
      , indexFiles = getIndexFilesForAllActiveProfiles(inputFileName);

    var i = commands.length;
    commands.forEach(function(command) {
      nexpect
        .spawn(command.ffmpeg)
        .run(function(err) {
          if (err) throw err;
          console.log("ran ffmpeg: " + command.ffmpeg);
          nexpect
            .spawn(command.segmenter)
            .run(function(err) {
              if (err) throw err;
              console.log("ran segmenter: " + command.segmenter);
              i--;
              if (i === 0) respondUpload(req, res, inputFileName, indexFiles);
            });
          });
      });

  });
}

function respondUpload(req, res, inputFileName, indexFiles) {
  var variableBitRateIndexFile = writeVariableBitRateIndexFile(inputFileName, indexFiles);
  res.writeHead(200, {'content-type': 'text/plain'});
  res.write(HTTP_PREFIX + variableBitRateIndexFile);
  res.end();
  console.log("finished handling request");
}

function handleStatic(req, res) {
  var filename = STREAM_OUTPUT_DIR + req.url.split('/').pop();
  path.exists(filename, function(exists){
    if (!exists) {
      res.writeHead(404, {"Content-Type": "text/plain"});
      res.write("404 Not Found\n");
      res.end();
      return;
    } else {
      fs.readFile(filename, "binary", function(err, file) {
        if(err) {
          res.writeHead(500, {"Content-Type": "text/plain"});
          res.write(err + "\n");
          res.end();
          return;
        }
        res.writeHead(200, {"Content-Type": mime.lookup(filename)});
        res.write(file, "binary");
        res.end();
      });
    }
  });
}

server = http.createServer(function(req, res) {
  if (req.url == '/upload' && req.method.toLowerCase() == 'post') {
    return handleUpload(req, res);
  } else if (req.url.indexOf(WEB_ROOT) == 0){
    return handleStatic(req, res);
  }
  res.writeHead(200, {'content-type': 'text/html'});
  res.end
    ( '<form action="/upload" enctype="multipart/form-data" method="post">'
    + '<input type="text" name="title"><br>'
    + '<input type="file" name="upload" multiple="multiple"><br>'
    + '<input type="submit" value="Upload">'
    + '</form>'
    );
});

process.chdir(STREAM_OUTPUT_DIR);
server.listen(PORT);
