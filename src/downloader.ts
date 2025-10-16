import { spawn } from "child_process";
import { promisify } from "util";
import { exec } from "child_process";
import path from "path";
import fs from "fs/promises";
import { db } from "./database.js";
import { configManager } from "./config.js";
import {
  sanitizeFilename,
  parseProgress,
  checkSponsorBlockData,
} from "./utils.js";
import type { Playlist, Video, DownloadProgress } from "./types.js";

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
        title: data.title || "Untitled Playlist",
        entries: (data.entries || []).map((entry: any) => ({
          id: entry.id,
          title: entry.title || "Untitled Video",
          url: entry.url || `https://www.youtube.com/watch?v=${entry.id}`,
        })),
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

    // Get current video IDs from YouTube playlist
    const currentVideoIds = new Set(playlistInfo.entries.map((v) => v.id));

    // Get videos in database for this playlist
    const dbVideos = db.getVideos(playlist.id);

    // Find videos that are in the database but no longer in the playlist
    const videosToDelete = dbVideos.filter((v) => !currentVideoIds.has(v.id));

    // Delete removed videos
    for (const video of videosToDelete) {
      console.log(`Deleting removed video: ${video.title}`);

      // Delete the video folder
      const config = configManager.getConfig();
      const videoFolder = path.join(config.downloadPath, video.id);

      try {
        await fs.rm(videoFolder, { recursive: true, force: true });
        console.log(`✓ Deleted folder: ${videoFolder}`);
      } catch (error: any) {
        console.error(
          `Failed to delete folder ${videoFolder}: ${error.message}`
        );
      }

      // Delete from database
      await db.deleteVideo(video.id);
      console.log(`✓ Deleted from database: ${video.title}`);
    }

    if (videosToDelete.length > 0) {
      console.log(
        `Removed ${videosToDelete.length} deleted video(s) from playlist: ${playlist.title}`
      );
    }

    // Filter out already downloaded videos
    const newVideos = playlistInfo.entries.filter(
      (video) => !db.isVideoDownloaded(video.id)
    );

    console.log(
      `Found ${newVideos.length} new videos in playlist: ${playlist.title}`
    );

    // Add to download queue
    for (const video of newVideos) {
      this.downloadQueue.push({
        ...video,
        playlistId: playlist.id,
      } as VideoInfo & { playlistId: string });
    }

    // Update last checked timestamp
    await db.updatePlaylist(playlist.id, {
      lastChecked: new Date().toISOString(),
    });

    // Start processing queue if not already processing
    if (!this.isProcessingQueue) {
      this.processQueue();
    }

    return newVideos.length;
  }

  async syncAllPlaylists(): Promise<void> {
    const playlists = db.getPlaylists().filter((p) => p.enabled);

    for (const playlist of playlists) {
      try {
        await this.syncPlaylist(playlist);
      } catch (error: any) {
        console.error(
          `Error syncing playlist ${playlist.title}:`,
          error.message
        );
      }
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    const config = configManager.getConfig();

    while (this.downloadQueue.length > 0) {
      // Check if we're at max concurrent downloads
      if (this.activeDownloads.size >= config.maxConcurrentDownloads) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      const video = this.downloadQueue.shift();
      if (!video) break;

      // Start download without waiting for it to complete
      this.downloadVideo(video as VideoInfo & { playlistId: string }).catch(
        (error) => {
          console.error(`Error downloading video ${video.title}:`, error);
        }
      );
    }

    this.isProcessingQueue = false;
  }

  private async downloadVideo(
    video: VideoInfo & { playlistId: string }
  ): Promise<void> {
    const config = configManager.getConfig();

    const sanitizedTitle = sanitizeFilename(video.title);

    // Create a folder for each video using video ID
    const videoFolder = path.join(config.downloadPath, video.id);
    await fs.mkdir(videoFolder, { recursive: true });

    const outputTemplate = path.join(videoFolder, `${sanitizedTitle}.%(ext)s`);

    const progress: DownloadProgress = {
      videoId: video.id,
      title: video.title,
      progress: 0,
      status: "downloading",
    };

    this.activeDownloads.set(video.id, progress);

    return new Promise((resolve, reject) => {
      const ytdlp = spawn("yt-dlp", [
        "-f",
        config.quality,
        "-o",
        outputTemplate,
        "--merge-output-format",
        "mp4",
        "--embed-chapters",
        "--embed-metadata",
        "--embed-thumbnail",
        "--sponsorblock-remove",
        config.sponsorBlockCategories.join(","),
        "--write-thumbnail",
        "--convert-thumbnails",
        "jpg",
        "-o",
        "thumbnail:" + path.join(videoFolder, "poster.%(ext)s"),
        "--newline",
        "--no-playlist",
        `https://www.youtube.com/watch?v=${video.id}`,
      ]);

      let outputPath = "";

      ytdlp.stdout.on("data", (data: Buffer) => {
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
        const alreadyDownloaded = line.includes("has already been downloaded");
        if (alreadyDownloaded && outputPath) {
          // Extract filename from previous line or use template
          console.log(`Video ${video.title} already exists`);
        }

        // Check if download is complete
        if (
          line.includes("100%") ||
          line.includes("has already been downloaded")
        ) {
          progress.progress = 100;
        }
      });

      ytdlp.stderr.on("data", (data: Buffer) => {
        console.error(`yt-dlp stderr: ${data.toString()}`);
      });

      ytdlp.on("close", async (code) => {
        this.activeDownloads.delete(video.id);

        if (code === 0) {
          progress.status = "completed";

          // If outputPath wasn't captured, try to find the file in the video folder
          if (!outputPath) {
            const possibleExtensions = ["mp4", "webm", "mkv"];
            for (const ext of possibleExtensions) {
              const testPath = path.join(
                videoFolder,
                `${sanitizedTitle}.${ext}`
              );
              try {
                await fs.access(testPath);
                outputPath = testPath;
                break;
              } catch {
                // File doesn't exist, try next extension
              }
            }
          }

          // Duplicate the thumbnail to create separate poster and
          // background files for media servers
          const posterPath = path.join(videoFolder, "poster.jpg");
          const backgroundPath = path.join(videoFolder, "background.jpg");
          try {
            await fs.copyFile(posterPath, backgroundPath);
          } catch (error: any) {
            console.error(`Failed to create poster copy: ${error.message}`);
          }

          // Check if SponsorBlock has data for this video
          console.log(`Checking SponsorBlock data for: ${video.title}`);
          const hasSponsorBlock = await checkSponsorBlockData(
            video.id,
            config.sponsorBlockCategories
          );
          console.log(
            `SponsorBlock data ${
              hasSponsorBlock ? "found" : "not found"
            } for: ${video.title}`
          );

          // Save to database
          await db.addVideo({
            id: video.id,
            playlistId: video.playlistId,
            title: video.title,
            filepath:
              outputPath || path.join(videoFolder, `${sanitizedTitle}.mp4`),
            status: "completed",
            hasSponsorBlock,
          });

          console.log(`✓ Downloaded: ${video.title}`);
          resolve();
        } else {
          progress.status = "failed";
          progress.error = `yt-dlp exited with code ${code}`;

          await db.addVideo({
            id: video.id,
            playlistId: video.playlistId,
            title: video.title,
            filepath: "",
            status: "failed",
            error: progress.error,
          });

          console.error(`✗ Failed to download: ${video.title}`);
          reject(new Error(progress.error));
        }
      });

      ytdlp.on("error", async (error) => {
        this.activeDownloads.delete(video.id);
        progress.status = "failed";
        progress.error = error.message;

        await db.addVideo({
          id: video.id,
          playlistId: video.playlistId,
          title: video.title,
          filepath: "",
          status: "failed",
          error: error.message,
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

  /**
   * Re-download a video to get SponsorBlock segments
   * Deletes the existing video and downloads it again
   */
  async redownloadVideo(video: Video): Promise<void> {
    console.log(
      `Re-downloading video for SponsorBlock updates: ${video.title}`
    );

    // Delete the existing video folder
    const config = configManager.getConfig();
    const videoFolder = path.join(config.downloadPath, video.id);

    try {
      await fs.rm(videoFolder, { recursive: true, force: true });
      console.log(`✓ Deleted folder for re-download: ${videoFolder}`);
    } catch (error: any) {
      console.error(`Failed to delete folder ${videoFolder}: ${error.message}`);
      throw error;
    }

    // Delete from database
    await db.deleteVideo(video.id);

    // Add to download queue
    this.downloadQueue.push({
      id: video.id,
      title: video.title,
      url: `https://www.youtube.com/watch?v=${video.id}`,
      playlistId: video.playlistId,
    } as VideoInfo & { playlistId: string });

    // Start processing queue if not already processing
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  /**
   * Check all videos without SponsorBlock data and re-download if data is now available
   */
  async checkAndUpdateSponsorBlockVideos(): Promise<void> {
    console.log("Checking for videos that may have new SponsorBlock data...");

    const config = configManager.getConfig();
    const allVideos = db.getVideos();
    const videosWithoutSponsorBlock = allVideos.filter(
      (v) => v.status === "completed" && v.hasSponsorBlock === false
    );

    if (videosWithoutSponsorBlock.length === 0) {
      console.log("No videos pending SponsorBlock updates");
      return;
    }

    console.log(
      `Found ${videosWithoutSponsorBlock.length} video(s) to check for SponsorBlock updates`
    );

    let redownloadCount = 0;

    for (const video of videosWithoutSponsorBlock) {
      console.log(`Checking SponsorBlock for: ${video.title}`);
      const hasSponsorBlock = await checkSponsorBlockData(
        video.id,
        config.sponsorBlockCategories
      );

      if (hasSponsorBlock) {
        console.log(`✓ SponsorBlock data now available for: ${video.title}`);
        try {
          await this.redownloadVideo(video);
          redownloadCount++;
        } catch (error: any) {
          console.error(`Failed to re-download ${video.title}:`, error.message);
        }
      }
    }

    console.log(
      `Queued ${redownloadCount} video(s) for re-download with SponsorBlock data`
    );
  }
}

export const downloader = new Downloader();
