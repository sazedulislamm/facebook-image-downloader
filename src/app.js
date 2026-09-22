const {
  createFacebookPage,
} = require("./browser/facebookBrowser");

const {
  crawlImages,
  isSupportedGalleryUrl,
  getGalleryType,
} = require("./scraper/facebookImageScraper");

const {
  ensureDirectories,
} = require("./storage/fileManager");

const {
  getNextImageNumber,
} = require("./utils/filename");

const {
  ImageQueue,
} = require("./queue/imageQueue");

const {
  runImageWorker,
} = require("./queue/imageWorker");

const {
  logInfo,
  logSuccess,
  logWarning,
  logError,
} = require("./utils/logger");

const config =
  require("./config/config");

const WORKER_COUNT = 2;

async function main() {
  let browser = null;

  try {
    const pageUrl =
      process.argv[2];

    /**
     * ----------------------------------------
     * Validate command argument
     * ----------------------------------------
     */

    if (!pageUrl) {
      console.log("");

      console.log(
        "Usage:"
      );

      console.log(
        '  node src/app.js "https://www.facebook.com/USERNAME/photos"'
      );

      console.log(
        '  node src/app.js "https://www.facebook.com/PAGE/photos"'
      );

      console.log(
        '  node src/app.js "https://www.facebook.com/groups/GROUP/media"'
      );

      console.log("");

      process.exit(1);
    }

    /**
     * ----------------------------------------
     * Validate Facebook URL
     * ----------------------------------------
     */

    if (
      !isSupportedGalleryUrl(
        pageUrl
      )
    ) {
      throw new Error(
        "Invalid Facebook gallery URL.\n\n" +
        "Supported URLs:\n" +
        "  Profile: https://www.facebook.com/USERNAME/photos\n" +
        "  Page:    https://www.facebook.com/PAGE/photos\n" +
        "  Group:   https://www.facebook.com/groups/GROUP/media"
      );
    }

    const galleryType =
      getGalleryType(
        pageUrl
      );

    /**
     * ----------------------------------------
     * Header
     * ----------------------------------------
     */

    console.log("");

    console.log(
      "========================================"
    );

    console.log(
      " Facebook Image Downloader"
    );

    console.log(
      "========================================"
    );

    console.log("");

    logInfo(
      `Target URL: ${pageUrl}`
    );

    logInfo(
      `Gallery type: ${galleryType}`
    );

    logInfo(
      `Download workers: ${WORKER_COUNT}`
    );

    /**
     * ----------------------------------------
     * Prepare directories
     * ----------------------------------------
     */

    await ensureDirectories();

    /**
     * ----------------------------------------
     * Start Facebook browser
     * ----------------------------------------
     */

    const browserResult =
      await createFacebookPage(
        pageUrl
      );

    browser =
      browserResult.browser;

    const page =
      browserResult.page;

    /**
     * ----------------------------------------
     * Create image queue
     * ----------------------------------------
     */

    const queue =
      new ImageQueue();

    /**
     * ----------------------------------------
     * Runtime counters
     * ----------------------------------------
     */

    const counters = {
      discovered: 0,
      downloaded: 0,
      duplicates: 0,
      failed: 0,
    };

    /**
     * ----------------------------------------
     * Image numbering
     * ----------------------------------------
     */

    let nextImageNumber =
      getNextImageNumber(
        config.DOWNLOAD_DIR
      );

    /**
     * ----------------------------------------
     * Start workers
     * ----------------------------------------
     */

    logInfo(
      `Starting ${WORKER_COUNT} image workers...`
    );

    const workers = [];

    for (
      let i = 1;
      i <= WORKER_COUNT;
      i++
    ) {
      workers.push(
        runImageWorker(
          queue,
          i,
          browserResult.context,
          counters
        )
      );
    }

    /**
     * ----------------------------------------
     * Start crawler
     * ----------------------------------------
     */

    logInfo(
      "Starting Facebook gallery crawler..."
    );

    for await (
      const image
      of crawlImages(
        page,
        pageUrl
      )
    ) {
      counters.discovered++;

      const imageNumber =
        nextImageNumber++;

      queue.add({
        image,

        imageNumber,

        pageUrl,
      });

      logInfo(
        `Queued image #${counters.discovered} ` +
        `(image-${String(
          imageNumber
        ).padStart(
          3,
          "0"
        )}) | ` +
        `Queue: ${queue.size}`
      );
    }

    /**
     * ----------------------------------------
     * Crawler finished
     * ----------------------------------------
     */

    logInfo(
      "Gallery crawler finished."
    );

    logInfo(
      `Total images discovered: ${counters.discovered}`
    );

    logInfo(
      "Waiting for download workers to finish..."
    );

    /**
     * Tell workers that no more items
     * will be added.
     */
    queue.close();

    /**
     * Wait until all downloads,
     * processing and duplicate checks finish.
     */
    await Promise.all(
      workers
    );

    /**
     * ----------------------------------------
     * Final result
     * ----------------------------------------
     */

    console.log("");

    console.log(
      "========================================"
    );

    console.log(
      " Crawl completed"
    );

    console.log(
      "========================================"
    );

    console.log("");

    console.log(
      `Gallery type:       ${galleryType}`
    );

    console.log(
      `Images discovered:  ${counters.discovered}`
    );

    console.log(
      `Images downloaded:  ${counters.downloaded}`
    );

    console.log(
      `Duplicates:         ${counters.duplicates}`
    );

    console.log(
      `Failed:             ${counters.failed}`
    );

    console.log("");
  } catch (
    error
  ) {
    logError(
      error.stack ||
      error.message
    );

    process.exitCode = 1;
  } finally {
    /**
     * ----------------------------------------
     * Close automation browser
     * ----------------------------------------
     */

    if (browser) {
      try {
        await browser.close();

        logInfo(
          "Chrome automation session closed."
        );
      } catch (
        error
      ) {
        logWarning(
          `Could not close Chrome cleanly: ${error.message}`
        );
      }
    }
  }
}

main();