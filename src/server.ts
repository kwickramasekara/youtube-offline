import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './database.js';
import { downloader } from './downloader.js';
import { scheduler } from './scheduler.js';
import { checkYtDlpInstalled } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Get all playlists
app.get('/api/playlists', (req, res) => {
  try {
    const playlists = db.getPlaylists();
    res.json(playlists);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Add a new playlist
app.post('/api/playlists', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'Playlist URL is required' });
    }

    // Validate URL format
    if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    // Fetch playlist info
    console.log('Fetching playlist info for:', url);
    const playlistInfo = await downloader.getPlaylistInfo(url);

    // Add to database
    const playlist = await db.addPlaylist({
      url,
      title: playlistInfo.title,
      lastChecked: null,
      enabled: true
    });

    // Trigger immediate sync
    downloader.syncPlaylist(playlist).catch(error => {
      console.error('Error syncing new playlist:', error);
    });

    res.json(playlist);
  } catch (error: any) {
    console.error('Error adding playlist:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a playlist
app.delete('/api/playlists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const success = await db.removePlaylist(id);

    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Playlist not found' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Toggle playlist enabled status
app.patch('/api/playlists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;

    const playlist = await db.updatePlaylist(id, { enabled });

    if (playlist) {
      res.json(playlist);
    } else {
      res.status(404).json({ error: 'Playlist not found' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all videos
app.get('/api/videos', (req, res) => {
  try {
    const { playlistId } = req.query;
    const videos = db.getVideos(playlistId as string | undefined);
    res.json(videos);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get download status
app.get('/api/downloads/status', (req, res) => {
  try {
    const activeDownloads = downloader.getActiveDownloads();
    const queueLength = downloader.getQueueLength();

    res.json({
      active: activeDownloads,
      queueLength
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Trigger manual sync
app.post('/api/sync', async (req, res) => {
  try {
    const { playlistId } = req.body;

    if (playlistId) {
      // Sync specific playlist
      const playlists = db.getPlaylists();
      const playlist = playlists.find(p => p.id === playlistId);

      if (!playlist) {
        return res.status(404).json({ error: 'Playlist not found' });
      }

      downloader.syncPlaylist(playlist).catch(error => {
        console.error('Error syncing playlist:', error);
      });

      res.json({ message: 'Sync started for playlist', playlistId });
    } else {
      // Sync all playlists
      downloader.syncAllPlaylists().catch(error => {
        console.error('Error syncing all playlists:', error);
      });

      res.json({ message: 'Sync started for all playlists' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get config
app.get('/api/config', (req, res) => {
  try {
    const config = db.getConfig();
    res.json(config);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update config
app.put('/api/config', async (req, res) => {
  try {
    const updates = req.body;

    // Validate updates
    if (updates.port && (updates.port < 1 || updates.port > 65535)) {
      return res.status(400).json({ error: 'Invalid port number' });
    }

    if (updates.checkIntervalHours && updates.checkIntervalHours < 1) {
      return res.status(400).json({ error: 'Check interval must be at least 1 hour' });
    }

    const config = await db.updateConfig(updates);

    // Restart scheduler if interval changed
    if (updates.checkIntervalHours) {
      scheduler.restart();
    }

    res.json(config);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Server-Sent Events for real-time updates
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send initial connection message
  res.write('data: {"type":"connected"}\n\n');

  // Send download status updates every 2 seconds
  const interval = setInterval(() => {
    const activeDownloads = downloader.getActiveDownloads();
    const queueLength = downloader.getQueueLength();

    res.write(`data: ${JSON.stringify({
      type: 'downloads',
      active: activeDownloads,
      queueLength
    })}\n\n`);
  }, 2000);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(interval);
  });
});

// Start server
async function start() {
  try {
    // Check if yt-dlp is installed
    const ytdlpInstalled = await checkYtDlpInstalled();
    if (!ytdlpInstalled) {
      console.error('ERROR: yt-dlp is not installed!');
      console.error('Please install yt-dlp: https://github.com/yt-dlp/yt-dlp#installation');
      process.exit(1);
    }

    // Load database
    await db.load();
    console.log('Database loaded');

    // Start scheduler
    scheduler.start();

    // Start server
    const config = db.getConfig();
    app.listen(config.port, '0.0.0.0', () => {
      console.log(`\n🚀 YouTube Offline is running!`);
      console.log(`📡 Web interface: http://localhost:${config.port}`);
      console.log(`📁 Download path: ${config.downloadPath}`);
      console.log(`⏰ Check interval: every ${config.checkIntervalHours} hours\n`);
    });
  } catch (error: any) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  scheduler.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down gracefully...');
  scheduler.stop();
  process.exit(0);
});

start();
