export interface Playlist {
  id: string;
  url: string;
  title: string;
  lastChecked: string | null;
  enabled: boolean;
}

export interface Video {
  id: string;
  playlistId: string;
  title: string;
  downloadedAt: string;
  filepath: string;
  status: "completed" | "failed";
  error?: string;
  hasSponsorBlock?: boolean;
}

export interface Config {
  downloadPath: string;
  checkIntervalHours: number;
  port: number;
  quality: string;
  maxConcurrentDownloads: number;
  sponsorBlockCategories: string[];
}

export interface Database {
  playlists: Playlist[];
  videos: Video[];
}

export interface DownloadProgress {
  videoId: string;
  title: string;
  progress: number;
  status: "downloading" | "completed" | "failed" | "queued";
  error?: string;
}
