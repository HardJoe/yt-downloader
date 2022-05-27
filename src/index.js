require('dotenv').config();
const cors = require('cors');
const express = require('express');
const fs = require('fs');
const mongoose = require('mongoose');
const youtubedl = require('youtube-dl-exec');
const Video = require('./models/video');

const app = express();

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('connected to MongoDB');
  })
  .catch((err) => {
    console.log('error connecting to MongoDB:', err.message);
  });

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  return res.render('index');
});

const getInfo = (url, flags) =>
  youtubedl(url, { dumpSingleJson: true, ...flags });

app.post('/download/video', async (req, res) => {
  try {
    const videoId = req.body.videoId;
    if (!videoId) {
      throw new Error('invalid video id');
    }

    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const info = await getInfo(url);
    await youtubedl(url, { output: `videos/${info.title}.mp4` });

    const video = new Video({
      videoId,
      path: `videos/${info.title}.mp4`,
    });
    await video.save();

    res.json({
      data: {
        downloadId: videoId,
      },
    });
  } catch (err) {
    if (err.message === 'invalid video id') {
      res.status(400).json({
        detail: 'invalid video id',
      });
    } else if (err.message.includes('looks truncated')) {
      res.status(400).json({
        detail: 'incomplete video id',
      });
    } else if (err.message.includes('Video unavailable')) {
      res.status(403).json({
        detail: 'video unavailable',
      });
    } else {
      console.log('err.message', err.message);
      res.status(500).json({
        detail: 'internal server error',
      });
    }
  }
});

app.get('/download/video', async (req, res) => {
  try {
    const videoId = req.query.videoId;
    if (!videoId) {
      throw new Error('invalid video id');
    }
    const video = await Video.findOne({ videoId });
    if (!video) {
      throw new Error('video not found');
    }
    const path = video.path;
    res.download(path);
  } catch (err) {
    if (err.message === 'invalid video id') {
      res.status(400).json({
        detail: 'invalid video id',
      });
    } else if (err.message === 'video not found') {
      res.status(404).json({
        detail: 'video not found',
      });
    } else {
      console.log('err.message', err.message);
      res.status(500).json({
        detail: 'internal server error',
      });
    }
  }
});

app.get('/download/path', async (req, res) => {
  try {
    const videoId = req.query.videoId;
    if (!videoId) {
      throw new Error('invalid video id');
    }
    const video = await Video.findOne({ videoId });
    if (!video) {
      throw new Error('video not found');
    }
    res.json({
      data: {
        filePath: video.path,
      },
    });
  } catch (err) {
    if (err.message === 'invalid video id') {
      res.status(400).json({
        detail: 'invalid video id',
      });
    } else if (err.message === 'video not found') {
      res.status(404).json({
        detail: 'video not found',
      });
    } else {
      console.log('err.message', err.message);
      res.status(500).json({
        detail: 'internal server error',
      });
    }
  }
});

const index = fs.readFileSync('src/index.html', 'utf8');
app.get('/index', (req, res) => res.send(index));

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});
