# Quick Start Guide

Get YouTube Offline up and running in 5 minutes!

## 1. Installation

```bash
# Navigate to the project directory
cd ~/youtube-offline

# Run the installation script
./install.sh

# Enable the service to start on boot
systemctl --user enable youtube-offline

# Start the service
systemctl --user start youtube-offline
```

The installer will:

- ✅ Check for Node.js and npm
- ✅ Install yt-dlp if not present
- ✅ Install npm dependencies
- ✅ Build the TypeScript project
- ✅ Set up systemd service

## 2. Access the Web Interface

Open your browser and go to:

```
http://localhost:36660
```

Or if you're on a remote server, use:

```
http://YOUR_SERVER_IP:36660
```

## 3. Add Your First Playlist

1. Copy a YouTube playlist URL, for example:

   ```
   https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf
   ```

2. Paste it into the "Add Playlist" field

3. Click "Add Playlist"

4. The app will automatically:
   - Fetch playlist information
   - Start downloading all videos
   - Show progress in real-time

## 4. Monitor Downloads

Watch the "Current Downloads" section to see:

- Active downloads with progress bars
- Queue length (pending downloads)
- Download status

## 5. Configure Settings

Edit the `config.json` file in the project root to adjust settings:

- **Download Path**: Where videos are saved (default: `./downloads`)
- **Check Interval**: How often to check for new videos (default: 6 hours)
- **Port**: Web interface port (default: 36660)
- **Quality**: Video quality format (default: best MP4)
- **Max Concurrent Downloads**: How many videos to download at once (default: 2)

After editing the file, restart the service:

```bash
systemctl --user restart youtube-offline
```

## Common Commands

### Check Service Status

```bash
systemctl --user status youtube-offline
```

### View Live Logs

```bash
journalctl --user -u youtube-offline -f
```

### Restart Service

```bash
systemctl --user restart youtube-offline
```

### Stop Service

```bash
systemctl --user stop youtube-offline
```

## Troubleshooting

### Service won't start?

```bash
# Check logs for errors
journalctl --user -u youtube-offline -n 50
```

### yt-dlp not found?

```bash
# Ensure it's in your PATH
which yt-dlp

# If not found, add ~/.local/bin to PATH
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### Can't access web interface?

- Check if port 36660 is available
- Try changing the port in `config.json` and restart the service
- Make sure the service is running: `systemctl --user status youtube-offline`

## Video Quality Examples

### Best Quality (Default)

```
bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best
```

### Max 1080p

```
bestvideo[height<=1080]+bestaudio/best[height<=1080]
```

### Max 720p (Save Space)

```
bestvideo[height<=720]+bestaudio/best[height<=720]
```

### Best Overall (Any Format)

```
best
```

## Tips

1. **Enable/Disable Playlists**: Toggle playlists on/off without deleting them
2. **Manual Sync**: Click "Sync" to immediately check for new videos
3. **Filter Videos**: Use the playlist dropdown to view videos from a specific playlist
4. **Edit Configuration**: The `config.json` file can be manually edited for settings
5. **Edit Database**: The `database.json` file can be manually edited for playlists/videos
6. **Backup**: Regularly backup both `config.json` and `database.json`

## Next Steps

- Add more playlists
- Adjust check interval based on your needs
- Configure custom download path
- Set up HTTPS (see remote server Nginx docs)
- Monitor disk space for downloads

## Need Help?

- 📖 Full documentation: [README.md](README.md)
- 📋 Product details: [PRD.md](PRD.md)
- 🔧 Advanced configuration: Edit `config.json`
- 📝 View logs: `journalctl --user -u youtube-offline -f`

Enjoy your automated YouTube downloads! 🎉
