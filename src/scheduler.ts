import cron from "node-cron";
import { configManager } from "./config.js";
import { downloader } from "./downloader.js";

export class Scheduler {
  private task: cron.ScheduledTask | null = null;

  start(): void {
    const config = configManager.getConfig();
    const hours = config.checkIntervalHours;

    // Convert hours to cron expression: "0 */6 * * *" for every 6 hours
    const cronExpression = `0 */${hours} * * *`;

    console.log(`Starting scheduler: checking playlists every ${hours} hours`);

    this.task = cron.schedule(cronExpression, async () => {
      console.log("Running scheduled playlist sync...");
      try {
        await downloader.syncAllPlaylists();
        console.log("Scheduled sync completed");

        // Check for videos that may have new SponsorBlock data
        console.log("Checking for SponsorBlock updates...");
        await downloader.checkAndUpdateSponsorBlockVideos();
        console.log("SponsorBlock check completed");
      } catch (error: any) {
        console.error("Error during scheduled sync:", error.message);
      }
    });

    // Also run immediately on startup
    setTimeout(async () => {
      console.log("Running initial playlist sync...");
      try {
        await downloader.syncAllPlaylists();
        console.log("Initial sync completed");

        // Check for SponsorBlock updates on startup
        console.log("Checking for SponsorBlock updates...");
        await downloader.checkAndUpdateSponsorBlockVideos();
        console.log("Initial SponsorBlock check completed");
      } catch (error: any) {
        console.error("Error during initial sync:", error.message);
      }
    }, 5000); // Wait 5 seconds after startup
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log("Scheduler stopped");
    }
  }

  restart(): void {
    this.stop();
    this.start();
  }
}

export const scheduler = new Scheduler();
