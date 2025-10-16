import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function checkYtDlpInstalled(): Promise<boolean> {
  try {
    await execAsync("yt-dlp --version");
    return true;
  } catch {
    return false;
  }
}

export function sanitizeFilename(filename: string): string {
  // Replace invalid characters with safe alternatives
  return filename
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 200); // Limit length to avoid filesystem issues
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

export function parseProgress(line: string): number | null {
  // Parse yt-dlp progress line: [download]  45.5% of 123.45MiB at 1.23MiB/s ETA 00:12
  const match = line.match(/\[download\]\s+(\d+\.?\d*)%/);
  if (match) {
    return parseFloat(match[1]);
  }
  return null;
}

/**
 * Check if SponsorBlock has data for a video
 * @param videoId YouTube video ID
 * @param categories SponsorBlock categories to check for
 * @returns true if SponsorBlock has segments for this video, false otherwise
 */
export async function checkSponsorBlockData(
  videoId: string,
  categories: string[]
): Promise<boolean> {
  try {
    const categoriesParam = JSON.stringify(categories);
    const response = await fetch(
      `https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}&categories=${categoriesParam}`,
      {
        method: "GET",
      }
    );

    if (response.status === 404) {
      // No segments found for this video
      return false;
    }

    if (!response.ok) {
      console.warn(
        `SponsorBlock API returned status ${response.status} for video ${videoId}`
      );
      return false;
    }

    const data = await response.json();
    // Check if there are any segments
    return Array.isArray(data) && data.length > 0;
  } catch (error: any) {
    console.error(
      `Error checking SponsorBlock data for ${videoId}:`,
      error.message
    );
    return false;
  }
}
