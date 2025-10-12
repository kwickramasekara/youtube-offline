import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { db } from './database.js';
import { sanitizeFilename, parseProgress } from './utils.js';
import type { Playlist, Video, DownloadProgress } from './types.js';

const execAsync = promisify(exec);

interface PlaylistInfo {
  id: string;
  title: string;
  entries: VideoInfo[];
}

interface VideoInfo {
  id: string;
  title: string;
  url: string;
}

export class Downloader {
  private activeDownloads: Map<string, DownloadProgress> = new Map();
  private downloadQueue: VideoInfo[] = [];
  private isProcessingQueue = false;

  async getPlaylistInfo(playlistUrl: string): Promise<PlaylistInfo> {
    try {
      const { stdout } = await execAsync(
        `yt-dlp --flat-playlist --dump-single-json "${playlistUrl}"`
      );

      const data = JSON.parse(stdout);

      return {
        id: data.id,
        title: data.title || 'Untitled Playlist',
        entries: (data.entries || []).map((entry: any) => ({
          id: entry.id,
          title: entry.title || 'Untitled Video',
          url: entry.url || `https://www.youtube.com/watch?v=${entry.id}`
        }))
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch playlist info: ${error.message}`);
    }
  }

  async syncPlaylist(playlist: Playlist): Promise<number> {
    console.log(`Syncing playlist: ${playlist.title}`);

    const playlistInfo = await this.getPlaylistInfo(playlist.url);

    // Update playlist title if changed
    if (playlistInfo.title !== playlist.title) {
      await db.updatePlaylist(playlist.id, { title: playlistInfo.title });
    }

    // Filter out already downloaded videos
    const newVideos = playlistInfo.entries.filter(
      video => !db.isVideoDownloaded(video.id)
    );

    console.log(`Found ${newVideos.length} new videos in playlist: ${playlist.title}`);

    // Add to download queue
    for (const video of newVideos) {
      this.downloadQueue.push({
        ...video,
        playlistId: playlist.id
      } as VideoInfo & { playlistId: string });
    }

    // Update last checked timestamp
    await db.updatePlaylist(playlist.id, {
      lastChecked: new Date().toISOString()
    });

    // Start processing queue if not already processing
    if (!this.isProcessingQueue) {
      this.processQueue();
    }

    return newVideos.length;
  }

  async syncAllPlaylists(): Promise<void> {
    const playlists = db.getPlaylists().filter(p => p.enabled);

    for (const playlist of playlists) {
      try {
        await this.syncPlaylist(playlist);
      } catch (error: any) {
        console.error(`Error syncing playlist ${playlist.title}:`, error.message);
      }
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    const config = db.getConfig();

    while (this.downloadQueue.length > 0) {
      // Check if we're at max concurrent downloads
      if (this.activeDownloads.size >= config.maxConcurrentDownloads) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      const video = this.downloadQueue.shift();
      if (!video) break;

      // Start download without waiting for it to complete
      this.downloadVideo(video as VideoInfo & { playlistId: string }).catch(error => {
        console.error(`Error downloading video ${video.title}:`, error);
      });
    }

    this.isProcessingQueue = false;
  }

  private async downloadVideo(video: VideoInfo & { playlistId: string }): Promise<void> {
    const config = db.getConfig();

    const sanitizedTitle = sanitizeFilename(video.title);

    // Create a folder for each video using video ID
    const videoFolder = path.join(config.downloadPath, video.id);
    await fs.mkdir(videoFolder, { recursive: true });

    const outputTemplate = path.join(videoFolder, `${sanitizedTitle}.%(ext)s`);

    const progress: DownloadProgress = {
      videoId: video.id,
      title: video.title,
      progress: 0,
      status: 'downloading'
    };

    this.activeDownloads.set(video.id, progress);

    return new Promise((resolve, reject) => {
      const ytdlp = spawn('yt-dlp', [
        '-f', config.quality,
        '-o', outputTemplate,
        '--recode-video', 'mp4',
        '--embed-chapters',
        '--embed-metadata',
        '--embed-thumbnail',
        '--sponsorblock-mark', 'all',
        '--write-thumbnail',
        '--convert-thumbnails', 'jpg',
        '-o', 'thumbnail:' + path.join(videoFolder, 'background.%(ext)s'),
        '--newline',
        '--no-playlist',
        `https://www.youtube.com/watch?v=${video.id}`
      ]);

      let outputPath = '';

      ytdlp.stdout.on('data', (data: Buffer) => {
        const line = data.toString();

        // Extract progress
        const progressValue = parseProgress(line);
        if (progressValue !== null) {
          progress.progress = progressValue;
        }

        // Extract destination filename
        const destMatch = line.match(/\[download\] Destination: (.+)/);
        if (destMatch) {
          outputPath = destMatch[1].trim();
        }

        // Check if already downloaded
        const alreadyDownloaded = line.includes('has already been downloaded');
        if (alreadyDownloaded && outputPath) {
          // Extract filename from previous line or use template
          console.log(`Video ${video.title} already exists`);
        }

        // Check if download is complete
        if (line.includes('100%') || line.includes('has already been downloaded')) {
          progress.progress = 100;
        }
      });

      ytdlp.stderr.on('data', (data: Buffer) => {
        console.error(`yt-dlp stderr: ${data.toString()}`);
      });

      ytdlp.on('close', async (code) => {
        this.activeDownloads.delete(video.id);

        if (code === 0) {
          progress.status = 'completed';

          // If outputPath wasn't captured, try to find the file in the video folder
          if (!outputPath) {
            const possibleExtensions = ['mp4', 'webm', 'mkv'];
            for (const ext of possibleExtensions) {
              const testPath = path.join(videoFolder, `${sanitizedTitle}.${ext}`);
              try {
                await fs.access(testPath);
                outputPath = testPath;
                break;
              } catch {
                // File doesn't exist, try next extension
              }
            }
          }

          // Save to database
          await db.addVideo({
            id: video.id,
            playlistId: video.playlistId,
            title: video.title,
            filepath: outputPath || path.join(videoFolder, `${sanitizedTitle}.mp4`),
            status: 'completed'
          });

          console.log(`✓ Downloaded: ${video.title}`);
          resolve();
        } else {
          progress.status = 'failed';
          progress.error = `yt-dlp exited with code ${code}`;

          await db.addVideo({
            id: video.id,
            playlistId: video.playlistId,
            title: video.title,
            filepath: '',
            status: 'failed',
            error: progress.error
          });

          console.error(`✗ Failed to download: ${video.title}`);
          reject(new Error(progress.error));
        }
      });

      ytdlp.on('error', async (error) => {
        this.activeDownloads.delete(video.id);
        progress.status = 'failed';
        progress.error = error.message;

        await db.addVideo({
          id: video.id,
          playlistId: video.playlistId,
          title: video.title,
          filepath: '',
          status: 'failed',
          error: error.message
        });

        reject(error);
      });
    });
  }

  getActiveDownloads(): DownloadProgress[] {
    return Array.from(this.activeDownloads.values());
  }

  getQueueLength(): number {
    return this.downloadQueue.length;
  }
}

export const downloader = new Downloader();
