# livestreaming-js

A complete system for producing and serving content conforming to the [HTTP Live Streaming](http://tools.ietf.org/html/draft-pantos-http-live-streaming) specification, built on [Node](http://nodejs.org/).

Note that this project is currently in a prototype stage.  In particular, improvements to error handling and testing should be made before using this in any serious capacity.  Furthermore, to improve resilience to failure, queues should be used to pass messages between separate processes for each stage in the workflow.

#### Thanks

Special thanks to [Carson McDonald](http://www.ioncannon.net/about/) for [trailblazing](http://www.ioncannon.net/projects/http-live-video-stream-segmenter-and-distributor/) and releasing [HTTP Live Video Stream Segmenter and Distributor](http://github.com/carsonmcdonald/HTTP-Live-Video-Stream-Segmenter-and-Distributor).  Readers are encouraged to evaluate Carson's project, as it is more robust and more configurable than `livestreaming-js`.

## Theory of Operations

The workflow implemented by this system looks (very crudely) like this:

![system](https://github.com/mjrusso/livestreaming-js/raw/master/assets/system.png)

In more detail:

### Upload Server

Accepts a video file via HTTP POST and saves the file to disk.

### Encoder

Encodes the file that was uploaded in the previous phase multiple times, each time at a different bitrate.  The encoding is performed using FFmpeg, and a separate MPEG-2 Transport Stream (`.ts` file extension) is produced for each bitrate.  The bitrates of the generated files can be modified by editing the `enabled` property in `profiles.json`.

Note that the default encoding options used for this phase produce video in H264 and that the output is optimized for iOS devices.  The output can be tweaked by editing the `command` property in `profiles.json`.

Also note that FFmpeg will not necessarily work flawlessly with the default `command` and any arbitrary source video, although source videos that were recorded on the iPhone consistently behave well.

### Segmenter

Splits all of the MPEG-2 Transport Streams produced in the previous phase into a series of shorter segments. (Each segment is 5 seconds long, by default, but this is configurable.)

For each input MPEG-2 Transport Stream (one per bitrate), the Segmenter also produces an index file (`.m3u8` file extension) that contains a list of all of the `.ts` segments produced at this phase, and the URL at which each segment can be accessed.

Finally, once all segments have been generated and the index files have been written for each bitrate, a master index file is generated (also with a `.m3u8` file extension).  This file enables variable bitrate streaming, containing a list of each index file, an indication of the bitrate represented by each index file, and the URL that each index file can be accessed at.

All produced index files comply with the [HTTP Live Streaming](http://tools.ietf.org/html/draft-pantos-http-live-streaming) specification.

### Content Server

Serves all of the index files and segment files produced in the previous phase via HTTP GET.

### Client

Clients access the Content Server directly, downloading index files and segments over HTTP.  It is the client's responsibility to buffer appropriately, to play segments in order without any gaps, and to use heuristics to decide the bitrate of the stream it should be playing back at this given instant (and also, when to switch streams).

Compatible clients (i.e., clients that that implement HTTP Live Streaming) include iOS v3.0+ devices (iPhone, iPod Touch, iPad, etc.), and desktops with QuickTime 10 (included with Mac OS X Snow Leopard).

## Pre-requisites

### livestreaming-js

Clone this project and initialize/ update the required git submodules:

    git clone git://github.com/mjrusso/livestreaming-js.git
    git submodule init
    git submodule update

### Node

This project has been tested against [Node](http://nodejs.org/) version 0.2.1.

To install this specific version of Node:

    wget http://nodejs.org/dist/node-v0.2.1.tar.gz
    tar xzvf node-v0.2.1.tar.gz
    cd node-v0.2.1
    ./configure
    make
    make install

### FFmpeg

Ensure that the following packages are installed before building [FFmpeg](http://ffmpeg.org/):

    - faac-devel
    - faad2-devel
    - lame-devel
    - libbz2-dev
    - x264-devel

When configuring FFMpeg, use the following flags:

    configure --enable-gpl --enable-nonfree --enable-pthreads
              --enable-libfaac --enable-libfaad --enable-libmp3lame
              --enable-libx264

### Segmenter

This project includes a [stream segmenter](http://svn.assembla.com/svn/legend/segmenter/), in source form.

Build the segmenter as follows:

    cd segmenter/
    make
    cd ..

## Usage

To run the server:

    node src/app.js

When a file is uploaded, the processing chain (Encoder + Segmenter) will be immediately kicked off.

Once this processing is complete, and all segments and index files have been generated, the URL of the variable bitrate index file will be returned as the response body of the HTTP upload request.

When this URL is supplied to any compatible client, adaptive bitrate streaming will be performed via HTTP Live Streaming.

### Defaults

By default, a server will be started at `http://localhost:4444`.  (To change the defaults, edit the `HOST_NAME` and `PORT` variables in `src/app.js`.)

Assuming the default values:

- an upload form will be rendered when visiting `http://localhost:4444` directly via a browser
- video uploads will be performed against `http://localhost:4444/upload`
- segment files and index files will be served from `http://localhost:4444/streams`
