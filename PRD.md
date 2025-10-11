# YouTube Offline - Product Requirements Document

## Overview

YouTube Offline is an automated playlist downloader designed to run on Ultraseedbox servers. It periodically checks YouTube playlists for new videos, downloads them in the highest quality available, and provides a web interface for management.

## Objectives

- Automatically download videos from YouTube playlists
- Periodically check for new videos and download them
- Skip already downloaded videos
- Provide a simple web interface for management
- Run reliably as a background service on Ultraseedbox servers

## Technologies Used

### Backend
- **Node.js with TypeScript**: Core application runtime
- **Express**: REST API server and web interface hosting
- **node-cron**: Periodic playlist synchronization scheduler
- **yt-dlp**: Video download engine (external binary)

### Frontend
- **Pico CSS**: Minimal, lightweight CSS framework
- **Vanilla JavaScript**: Simple, dependency-free frontend
- **Server-Sent Events**: Real-time download progress updates

### Storage
- **JSON file database**: Easy to read and manually edit configuration and state

### Deployment
- **systemd user service**: Background process management on Linux

## Core Features

### 1. Playlist Management
- ✅ Add YouTube playlists by URL
- ✅ Automatically fetch playlist metadata (title, video count)
- ✅ Enable/disable playlists
- ✅ Delete playlists and associated download records
- ✅ Manual sync trigger per playlist or all playlists

### 2. Automatic Downloads
- ✅ Download highest quality video available
- ✅ Configurable quality format strings (yt-dlp format)
- ✅ Skip already downloaded videos
- ✅ Queue management with configurable concurrent downloads
- ✅ Progress tracking and real-time reporting
- ✅ Error handling and logging

### 3. Periodic Synchronization
- ✅ Configurable check interval (default: 6 hours)
- ✅ Runs as systemd service with auto-restart
- ✅ Initial sync on startup
- ✅ Scheduled checks via cron

### 4. Web Interface
- ✅ Clean, minimal UI using Pico CSS
- ✅ Playlist management (add, enable/disable, sync, delete)
- ✅ Video library with filtering by playlist
- ✅ Real-time download progress display
- ✅ Configuration management panel
- ✅ Responsive design for mobile access

### 5. Configuration
- ✅ Download path (configurable location)
- ✅ Check interval (in hours)
- ✅ Server port
- ✅ Video quality format string
- ✅ Max concurrent downloads

## Technical Architecture

### File Structure
```
youtube-offline/
├── src/
│   ├── server.ts          # Express server & API routes
│   ├── scheduler.ts       # Cron job for periodic checks
│   ├── downloader.ts      # yt-dlp wrapper & download logic
│   ├── database.ts        # JSON file database manager
│   ├── types.ts           # TypeScript interfaces
│   └── utils.ts           # Helper functions
├── public/
│   ├── index.html         # Web interface
│   ├── style.css          # Styling with Pico CSS
│   └── app.js             # Frontend logic
├── dist/                  # Compiled JavaScript
├── downloads/             # Default download location
├── logs/                  # Application logs
├── database.json          # Application database
├── database.example.json  # Example database structure
├── package.json
├── tsconfig.json
├── install.sh            # Installation script
├── youtube-offline.service # systemd service file
└── README.md             # Documentation
```

### API Endpoints

**Playlists:**
- `GET /api/playlists` - List all playlists
- `POST /api/playlists` - Add new playlist
- `PATCH /api/playlists/:id` - Update playlist (enable/disable)
- `DELETE /api/playlists/:id` - Delete playlist

**Videos:**
- `GET /api/videos` - List all downloaded videos
- `GET /api/videos?playlistId=:id` - Filter videos by playlist

**Downloads:**
- `GET /api/downloads/status` - Get current download status
- `POST /api/sync` - Trigger manual sync (all or specific playlist)

**Configuration:**
- `GET /api/config` - Get current configuration
- `PUT /api/config` - Update configuration

**Real-time Updates:**
- `GET /api/events` - Server-Sent Events for live download progress

### Database Schema

```typescript
interface Playlist {
  id: string;
  url: string;
  title: string;
  lastChecked: string | null;
  enabled: boolean;
}

interface Video {
  id: string;
  playlistId: string;
  title: string;
  downloadedAt: string;
  filepath: string;
  status: 'completed' | 'failed';
  error?: string;
}

interface Config {
  downloadPath: string;
  checkIntervalHours: number;
  port: number;
  quality: string;
  maxConcurrentDownloads: number;
}
```

**Example database.json:**
```json
{
  "playlists": [
    {
      "id": "1234567890-abc123",
      "url": "https://www.youtube.com/playlist?list=...",
      "title": "My Playlist",
      "lastChecked": "2025-01-15T10:30:00.000Z",
      "enabled": true
    }
  ],
  "videos": [
    {
      "id": "dQw4w9WgXcQ",
      "playlistId": "1234567890-abc123",
      "title": "Video Title",
      "downloadedAt": "2025-01-15T10:35:00.000Z",
      "filepath": "./downloads/Video Title.mp4",
      "status": "completed"
    }
  ],
  "config": {
    "downloadPath": "./downloads",
    "checkIntervalHours": 6,
    "port": 3000,
    "quality": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
    "maxConcurrentDownloads": 2
  }
}
```

## Installation & Deployment

### Prerequisites
- Node.js 18+ and npm
- Linux environment with systemd user services
- yt-dlp (installed automatically by install script)

### Quick Installation
```bash
cd ~/youtube-offline
./install.sh
systemctl --user enable youtube-offline
systemctl --user start youtube-offline
```

### Ultraseedbox Compatibility
✅ No sudo/root required
✅ Uses assigned port range
✅ All files in home directory
✅ Runs as systemd user service
✅ Lightweight and resource-efficient
✅ Minimal dependencies

## User Workflows

### Adding a Playlist
1. User opens web interface
2. Pastes YouTube playlist URL
3. Clicks "Add Playlist"
4. System fetches playlist info
5. System adds to database
6. System immediately starts downloading new videos

### Managing Downloads
1. User views active downloads with progress bars
2. Queue shows pending downloads
3. Downloaded videos appear in video library
4. Failed downloads show error messages

### Configuration
1. User opens configuration panel
2. Adjusts settings (path, interval, port, quality, concurrency)
3. Saves configuration
4. System applies changes (scheduler restarts if interval changed)

## Quality Format Examples

- **Best quality MP4:**
  `bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best`

- **Max 1080p:**
  `bestvideo[height<=1080]+bestaudio/best[height<=1080]`

- **Max 720p:**
  `bestvideo[height<=720]+bestaudio/best[height<=720]`

- **Best overall:**
  `best`

See [yt-dlp format selection](https://github.com/yt-dlp/yt-dlp#format-selection) for more options.

## Error Handling

- ✅ Missing yt-dlp: Shows error and installation instructions
- ✅ Invalid playlist URL: Returns 400 error with message
- ✅ Download failures: Logs error, marks video as failed, continues queue
- ✅ Network issues: Auto-retry logic built into yt-dlp
- ✅ Disk space: OS handles, logs show errors

## Monitoring & Maintenance

### Service Management
```bash
# Start
systemctl --user start youtube-offline

# Stop
systemctl --user stop youtube-offline

# Restart
systemctl --user restart youtube-offline

# Status
systemctl --user status youtube-offline

# Logs
journalctl --user -u youtube-offline -f
```

### Log Files
- Standard output: `~/youtube-offline/logs/output.log`
- Standard error: `~/youtube-offline/logs/error.log`
- Systemd journal: `journalctl --user -u youtube-offline`

## Security Considerations

- No authentication (runs on localhost by default)
- File system access limited to configured download path
- No code execution from user input
- Uses well-maintained yt-dlp for downloads
- Systemd service runs as user (no root)

## Performance

### Resource Usage
- Memory: ~50-100MB baseline, +50-100MB per concurrent download
- CPU: Low (mostly waiting on I/O), spikes during video processing
- Disk: Depends on video quality and quantity
- Network: Depends on download speed and quality

### Scalability
- Can handle hundreds of playlists
- Thousands of videos in database
- Concurrent downloads configurable (recommend 2-5)
- Periodic sync interval prevents overload

## Future Enhancements (Optional)

### High Priority
- [ ] Webhook notifications for completed downloads
- [ ] Storage space monitoring and warnings
- [ ] Video metadata storage (thumbnails, descriptions, upload date)
- [ ] Subtitle downloads

### Medium Priority
- [ ] Archive mode (download entire playlist history)
- [ ] Multiple quality presets
- [ ] Bandwidth throttling
- [ ] Email notifications
- [ ] Dark mode UI toggle

### Low Priority
- [ ] Multi-user support with authentication
- [ ] Download scheduling (only download during certain hours)
- [ ] Video transcoding/conversion
- [ ] Integration with media servers (Plex, Jellyfin)
- [ ] Mobile app

## Success Metrics

- ✅ Successfully runs on Ultraseedbox without root access
- ✅ Downloads highest quality videos automatically
- ✅ Skips duplicates correctly
- ✅ Periodic sync works reliably
- ✅ Web interface is responsive and intuitive
- ✅ Service auto-restarts on failure
- ✅ Minimal resource usage
- ✅ Easy to install and configure

## Dependencies

### Runtime (npm)
- `express` (~240KB) - Web server
- `node-cron` (~25KB) - Task scheduler

### Development (npm)
- `typescript` - Compiler
- `@types/express` - Type definitions
- `@types/node` - Type definitions
- `@types/node-cron` - Type definitions

### External
- `yt-dlp` - Binary (not npm package)
- `Pico CSS` - CDN (no install required)

**Total npm dependencies: 2 runtime + 4 dev = 6 packages**

## Conclusion

YouTube Offline provides a lightweight, reliable solution for automatically downloading YouTube playlists on Ultraseedbox servers. With minimal dependencies, a simple web interface, and robust error handling, it offers an excellent user experience while being easy to install and maintain.
