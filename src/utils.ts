import { exec } from "child_process";
import { promisify } from "util";
import https from "https";

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
  return new Promise((resolve) => {
    try {
      const categoriesParam = encodeURIComponent(JSON.stringify(categories));
      const url = `https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}&categories=${categoriesParam}`;

      const request = https.get(url, { timeout: 10000 }, (response) => {
        // Handle 404 - no segments found
        if (response.statusCode === 404) {
          resolve(false);
          return;
        }

        // Handle non-200 responses
        if (response.statusCode !== 200) {
          console.warn(
            `SponsorBlock API returned status ${response.statusCode} for video ${videoId}`
          );
          resolve(false);
          return;
        }

        // Collect response data
        let data = "";
        response.on("data", (chunk) => {
          data += chunk;
        });

        response.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            // Check if there are any segments
            resolve(Array.isArray(parsed) && parsed.length > 0);
          } catch (parseError: any) {
            console.error(
              `Error parsing SponsorBlock response for ${videoId}:`,
              parseError.message
            );
            resolve(false);
          }
        });
      });

      request.on("error", (error: any) => {
        console.error(
          `Error checking SponsorBlock data for ${videoId}:`,
          error.message
        );
        resolve(false);
      });

      request.on("timeout", () => {
        console.warn(`SponsorBlock API timeout for video ${videoId}`);
        request.destroy();
        resolve(false);
      });
    } catch (error: any) {
      console.error(
        `Error checking SponsorBlock data for ${videoId}:`,
        error.message
      );
      resolve(false);
    }
  });
}
