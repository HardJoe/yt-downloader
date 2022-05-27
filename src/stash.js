app.post('/download/video', async (req, res) => {
  try {
    const videoId = req.body.videoId;
    if (!videoId) {
      throw new Error('expected format');
    }
    const url = 'https://www.youtube.com/watch?v=' + videoId;
    const basicInfo = await ytdl.getBasicInfo(url);
    console.log(basicInfo.videoDetails.title);
    const info = await ytdl.getInfo(url);
    const format = ytdl.chooseFormat(info.formats, {
      quality: 'highestvideo',
    });
    console.log('Format found!', format);
    // ytdl(url, {
    //   filter: 'audioandvideo',
    //   quality: 'highestvideo',
    // }).pipe(fs.createWriteStream('videos/test.mp4'));

    // ytdl(url, {
    //   filter: 'audioandvideo',
    //   quality: 'highestvideo',
    // }).pipe(fs.createWriteStream('videos/test.mp4'));

    res.json({
      status: 200,
      message: 'success',
      data: {
        downloadId: videoId,
      },
    });
  } catch (err) {
    if (err.message.includes('expected format')) {
      res.status(400).json({
        status: 400,
        message: 'error',
        description: 'Video id does not match expected format',
      });
    } else if (err.message.includes('No video id found')) {
      res.status(404).json({
        status: 404,
        message: 'error',
        description: 'No video id found',
      });
    } else if (err.message.includes('Video unavailable')) {
      res.status(403).json({
        status: 403,
        message: 'error',
        description: 'Video unavailable',
      });
    } else {
      console.log('err.message', err.message);
      res.status(500).json({
        status: 500,
        message: 'error',
        description: 'Internal server error',
      });
    }
  }
});

app.get('/download/ffmpeg', async (req, res) => {
  /**
   * Reencode audio & video without creating files first
   *
   * Requirements: ffmpeg, ether via a manual installation or via ffmpeg-static
   *
   * If you need more complex features like an output-stream you can check the older, more complex example:
   * https://github.com/fent/node-ytdl-core/blob/cc6720f9387088d6253acc71c8a49000544d4d2a/example/ffmpeg.js
   */

  // Global constants
  const ref = 'https://www.youtube.com/watch?v=IKKar5SS29E';
  const basicInfo = await ytdl.getBasicInfo(ref);

  const tracker = {
    start: Date.now(),
    audio: { downloaded: 0, total: Infinity },
    video: { downloaded: 0, total: Infinity },
    merged: { frame: 0, speed: '0x', fps: 0 },
  };

  // Get audio and video streams
  const audio = ytdl(ref, { quality: 'highestaudio' }).on(
    'progress',
    (_, downloaded, total) => {
      tracker.audio = { downloaded, total };
    },
  );
  const video = ytdl(ref, { quality: 'highestvideo' }).on(
    'progress',
    (_, downloaded, total) => {
      tracker.video = { downloaded, total };
    },
  );

  // process.stdout.on('error', function (err) {
  //   if (err.code == 'EPIPE') {
  //     console.log('Error: EPIPE');
  //     process.exit(0);
  //   }
  // });

  // Prepare the progress bar
  let progressbarHandle = null;
  const progressbarInterval = 1000;
  const showProgress = () => {
    readline.cursorTo(process.stdout, 0);
    const toMB = (i) => (i / 1024 / 1024).toFixed(2);

    process.stdout.write(
      `Audio  | ${(
        (tracker.audio.downloaded / tracker.audio.total) *
        100
      ).toFixed(2)}% processed `,
    );
    process.stdout.write(
      `(${toMB(tracker.audio.downloaded)}MB of ${toMB(
        tracker.audio.total,
      )}MB).${' '.repeat(10)}\n`,
    );

    process.stdout.write(
      `Video  | ${(
        (tracker.video.downloaded / tracker.video.total) *
        100
      ).toFixed(2)}% processed `,
    );
    process.stdout.write(
      `(${toMB(tracker.video.downloaded)}MB of ${toMB(
        tracker.video.total,
      )}MB).${' '.repeat(10)}\n`,
    );

    process.stdout.write(`Merged | processing frame ${tracker.merged.frame} `);
    process.stdout.write(
      `(at ${tracker.merged.fps} fps => ${tracker.merged.speed}).${' '.repeat(
        10,
      )}\n`,
    );

    process.stdout.write(
      `running for: ${((Date.now() - tracker.start) / 1000 / 60).toFixed(
        2,
      )} Minutes.`,
    );
  };

  // Start the ffmpeg child process
  const ffmpegProcess = cp.spawn(
    ffmpeg,
    [
      // Remove ffmpeg's console spamming
      '-loglevel',
      '8',
      '-hide_banner',
      // Redirect/Enable progress messages
      '-progress',
      'pipe:3',
      // Set inputs
      '-i',
      'pipe:4',
      '-i',
      'pipe:5',
      // Map audio & video from streams
      '-map',
      '0:a',
      '-map',
      '1:v',
      // Keep encoding
      '-c:v',
      'copy',
      // Define output file
      `videos/${basicInfo.videoDetails.title}.mkv`,
    ],
    {
      windowsHide: true,
      stdio: [
        /* Standard: stdin, stdout, stderr */
        'inherit',
        'inherit',
        'inherit',
        /* Custom: pipe:3, pipe:4, pipe:5 */
        'pipe',
        'pipe',
        'pipe',
      ],
    },
  );

  // Link streams
  // FFmpeg creates the transformer streams and we just have to insert / read data
  ffmpegProcess.stdio[3].on('data', (chunk) => {
    // Start the progress bar
    if (!progressbarHandle)
      progressbarHandle = setInterval(showProgress, progressbarInterval);
    // Parse the param=value list returned by ffmpeg
    const lines = chunk.toString().trim().split('\n');
    const args = {};
    for (const l of lines) {
      const [key, value] = l.split('=');
      args[key.trim()] = value.trim();
    }
    tracker.merged = args;
  });
  audio.pipe(ffmpegProcess.stdio[4]);
  video.pipe(ffmpegProcess.stdio[5]);
  ffmpegProcess.on('close', () => {
    readline.moveCursor(process.stdout, 0, 5);
    console.log('Video download done.');
    // Cleanup
    process.stdout.write('\n\n\n\n');
    clearInterval(progressbarHandle);
  });
  res.json({ data: 'Video downloaded' });
});

app.get('/download/merge', async (req, res) => {
  res.header('Content-Disposition', `attachment;  filename=merge.mkv`);
  const url = 'https://www.youtube.com/watch?v=vPE7ZGc2mKY';
  const basicInfo = await ytdl.getBasicInfo(url);
  const video = ytdl(url, { filter: 'videoonly' });
  const audio = ytdl(url, { filter: 'audioonly', highWaterMark: 1 << 25 });
  // Start the ffmpeg child process
  const ffmpegProcess = cp.spawn(
    ffmpeg,
    [
      // Remove ffmpeg's console spamming
      '-loglevel',
      '0',
      '-hide_banner',
      '-progress',
      'pipe:2',
      '-i',
      'pipe:3',
      '-i',
      'pipe:4',
      '-reconnect',
      '1',
      '-reconnect_streamed',
      '1',
      '-reconnect_delay_max',
      '4',
      // Rescale the video
      // '-vf',
      // 'scale=1980:1080',
      // Choose some fancy codes
      '-c:v',
      'libx265',
      '-x265-params',
      'log-level=0',
      '-c:a',
      'flac',
      // Define output container
      '-f',
      'matroska',
      'copy',
      // Define output file
      `videos/${basicInfo.videoDetails.title}.mkv`,
    ],
    {
      windowsHide: true,
      stdio: [
        /* Standard: stdin, stdout, stderr */
        'inherit',
        'inherit',
        'inherit',
        /* Custom: pipe:4, pipe:5, pipe:6 */
        'pipe',
        'pipe',
        'pipe',
      ],
    },
  );

  // audio.pipe(ffmpegProcess.stdio[3]);
  // video.pipe(ffmpegProcess.stdio[4]);
  // ffmpegProcess.stdio[5].pipe(res);

  process.stdout.on('error', function (err) {
    console.log('Error: EPIPE');
    res.json({ error: err.code });
  });

  ffmpegProcess.on('close', () => {
    console.log('Video download done.');
  });
});
