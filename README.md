# YouTube Offline

Automatic YouTube playlist downloader with periodic sync and web interface. Designed to run on Ultraseedbox servers and similar environments.

## Features

- **Automatic Playlist Sync**: Periodically checks playlists for new videos (configurable interval, default 6 hours)
- **Highest Quality Downloads**: Downloads best available quality using yt-dlp
- **Plex-Compatible Format**: Automatically converts videos to MP4 (H.264/AAC) for universal compatibility and direct play
- **Chapter Support**: Embeds YouTube chapter markers into downloaded videos for Plex and Infuse
- **SponsorBlock Integration**: Automatically marks sponsor segments, intros, outros, and other skippable content as chapters
- **Metadata Embedding**: Includes video title, description, and other metadata in the downloaded files
- **Organized Storage**: Each video is saved in its own folder with video file and thumbnail
- **Skip Duplicates**: Automatically skips already downloaded videos
- **Web Interface**: Clean, minimal web UI for management
- **Queue Management**: Configurable concurrent downloads
- **JSON Database**: Easy to read and manually edit if needed
- **Systemd Service**: Runs as a background service with auto-restart
- **Real-time Progress**: Live download progress updates via Server-Sent Events
- **Configurable**: All settings adjustable through web interface

## Prerequisites

- Node.js 18+ and npm
- yt-dlp (will be installed automatically if not present)
- Linux environment with systemd user services support

## Installation

### Quick Install

```bash
# Clone or download the project to your preferred location
# For Ultraseedbox, recommended: ~/files/apps/youtube-offline
cd ~/files/apps/youtube-offline

# Run installation script
./install.sh

# Enable service to start on boot
systemctl --user enable youtube-offline

# Start the service
systemctl --user start youtube-offline
```

### Manual Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Install yt-dlp (if not already installed)
mkdir -p ~/.local/bin
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ~/.local/bin/yt-dlp
chmod +x ~/.local/bin/yt-dlp

# Add to PATH
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Create necessary directories
mkdir -p logs downloads

# Set up systemd service
mkdir -p ~/.config/systemd/user
cp youtube-offline.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable youtube-offline
systemctl --user start youtube-offline
```

## Usage

### Web Interface

Access the web interface at `http://localhost:36660` (or your configured port).

**Adding a Playlist:**
1. Paste a YouTube playlist URL
2. Click "Add Playlist"
3. The app will automatically fetch playlist info and start downloading

**Download Organization:**
- Each video is saved in its own folder named after the YouTube video ID
- Video thumbnail is automatically downloaded as `background.jpg` and embedded into the MP4 as cover art
- Videos are automatically converted to MP4 format for maximum compatibility with media servers
- YouTube chapter markers are embedded into the video file for easy navigation in Plex and Infuse
- SponsorBlock segments (sponsors, intros, outros, self-promos, etc.) are marked as chapters for easy skipping
- Video metadata (title, description, etc.) is embedded into the MP4 file
- Plex uses the embedded thumbnail as poster art and `background.jpg` as backdrop image
- Example structure:
  ```
  downloads/dQw4w9WgXcQ/
  ├── Video Title Name.mp4  (with embedded poster, chapters, metadata, and SponsorBlock markers)
  └── background.jpg
  ```
- This ensures unique folder names and keeps all related files organized together

**Managing Playlists:**
- **Enable/Disable**: Temporarily stop checking a playlist
- **Sync**: Manually trigger a sync for a specific playlist
- **Delete**: Remove playlist and all associated download records

**Configuration:**
- Download path
- Check interval (hours)
- Port number
- Video quality format string
- Max concurrent downloads

### Command Line

```bash
# Start the service
systemctl --user start youtube-offline

# Stop the service
systemctl --user stop youtube-offline

# Restart the service
systemctl --user restart youtube-offline

# Check status
systemctl --user status youtube-offline

# View logs
journalctl --user -u youtube-offline -f

# Development mode (without systemd)
npm run dev
```

## Configuration

Configuration is stored in `database.json` and can be edited through the web interface or manually.

### Default Configuration

```json
{
  "downloadPath": "./downloads",
  "checkIntervalHours": 6,
  "port": 36660,
  "quality": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
  "maxConcurrentDownloads": 2
}
```

### Quality Format Strings

The quality setting uses yt-dlp format strings. Common examples:

- `bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best` - Best quality MP4
- `best` - Best overall quality (any format)
- `bestvideo[height<=1080]+bestaudio/best[height<=1080]` - Max 1080p
- `bestvideo[height<=720]+bestaudio/best[height<=720]` - Max 720p

See [yt-dlp format selection](https://github.com/yt-dlp/yt-dlp#format-selection) for more options.

**Note:** All videos are automatically re-encoded to MP4 format (H.264 video codec and AAC audio codec) after download, regardless of the quality format selected. This ensures maximum compatibility with media servers, enabling direct play without transcoding.

## Database Schema

The `database.json` file contains three main sections:

### Playlists
```json
{
  "id": "unique-id",
  "url": "https://www.youtube.com/playlist?list=...",
  "title": "Playlist Title",
  "lastChecked": "2025-01-15T10:30:00.000Z",
  "enabled": true
}
```

### Videos
```json
{
  "id": "youtube-video-id",
  "playlistId": "playlist-unique-id",
  "title": "Video Title",
  "downloadedAt": "2025-01-15T10:35:00.000Z",
  "filepath": "/path/to/video.mp4",
  "status": "completed"
}
```

### Config
See Configuration section above.

## API Endpoints

The application provides a REST API:

### Playlists
- `GET /api/playlists` - List all playlists
- `POST /api/playlists` - Add a new playlist
- `PATCH /api/playlists/:id` - Update playlist (enable/disable)
- `DELETE /api/playlists/:id` - Delete playlist

### Videos
- `GET /api/videos` - List all downloaded videos
- `GET /api/videos?playlistId=:id` - List videos for specific playlist

### Downloads
- `GET /api/downloads/status` - Get current download status
- `POST /api/sync` - Trigger manual sync (all playlists)
- `POST /api/sync` (with `playlistId`) - Sync specific playlist

### Configuration
- `GET /api/config` - Get current configuration
- `PUT /api/config` - Update configuration

### Real-time Updates
- `GET /api/events` - Server-Sent Events for live download progress

## Troubleshooting

### Service won't start

```bash
# Check service status
systemctl --user status youtube-offline

# View detailed logs
journalctl --user -u youtube-offline -n 100
```

### yt-dlp not found

```bash
# Check if yt-dlp is in PATH
which yt-dlp

# If not, ensure ~/.local/bin is in PATH
echo $PATH

# Add to PATH
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### Permission errors

```bash
# Ensure directories are writable
chmod -R u+w ~/youtube-offline/downloads
```

### Port already in use

Edit `database.json` and change the port number, or use the web interface settings.

### Download failures

- Check internet connectivity
- Ensure yt-dlp is up to date: `yt-dlp -U`
- Check video availability (some videos may be geo-restricted or private)
- Review error logs: `journalctl --user -u youtube-offline -f`

## Directory Structure

```
youtube-offline/
├── src/                    # TypeScript source files
│   ├── server.ts          # Express server and API
│   ├── downloader.ts      # yt-dlp wrapper
│   ├── database.ts        # JSON database manager
│   ├── scheduler.ts       # Cron job scheduler
│   ├── types.ts           # TypeScript interfaces
│   └── utils.ts           # Utility functions
├── public/                # Web interface
│   ├── index.html
│   ├── style.css
│   └── app.js
├── dist/                  # Compiled JavaScript (generated)
├── downloads/             # Downloaded videos (default location)
├── database.json          # Application database
├── package.json
├── tsconfig.json
├── install.sh            # Installation script
└── youtube-offline.service # Systemd service file
```

## Advanced Usage

### Custom Download Path

You can configure a custom download path through the web interface or by editing `database.json`:

```json
{
  "config": {
    "downloadPath": "/path/to/your/downloads"
  }
}
```

### Multiple Instances

To run multiple instances on different ports:

1. Copy the entire directory
2. Change the port in the configuration
3. Create a new systemd service file with a different name
4. Enable and start the new service

### Backup and Restore

**Backup:**
```bash
cp database.json database.backup.json
```

**Restore:**
```bash
systemctl --user stop youtube-offline
cp database.backup.json database.json
systemctl --user start youtube-offline
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Watch mode for development
npm run watch
```

## Dependencies

### Runtime
- **express** - Web server
- **node-cron** - Task scheduler

### Development
- **typescript** - TypeScript compiler
- **@types/express** - Express type definitions
- **@types/node** - Node.js type definitions
- **@types/node-cron** - node-cron type definitions

### External
- **yt-dlp** - Video downloader (binary, not npm package)

## License

MIT

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review logs: `journalctl --user -u youtube-offline -f`
3. Check yt-dlp issues: https://github.com/yt-dlp/yt-dlp/issues
4. For Ultraseedbox-specific issues, consult their documentation

## Credits

Built with:
- [Node.js](https://nodejs.org/)
- [Express](https://expressjs.com/)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [Pico CSS](https://picocss.com/)
- [node-cron](https://github.com/node-cron/node-cron)
