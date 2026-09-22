const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "../..");

const DATA_DIR = path.join(ROOT_DIR, "data");
const DOWNLOAD_DIR = path.join(ROOT_DIR, "downloads");
const LOG_DIR = path.join(ROOT_DIR, "logs");

const DATABASE_FILE = path.join(DATA_DIR, "images.json");

module.exports = {
  ROOT_DIR,

  DATA_DIR,
  DOWNLOAD_DIR,
  LOG_DIR,
  DATABASE_FILE,

  SCRAPER: {
    // How many scrolls can happen in one run.
    // This is a safety limit, not the normal stopping condition.
    MAX_SCROLLS: 1000,

    // Wait after each scroll.
    SCROLL_DELAY_MIN: 2500,
    SCROLL_DELAY_MAX: 4500,

    // Number of consecutive scrolls without new media
    // before considering the page finished.
    MAX_IDLE_SCROLLS: 8,

    MIN_IMAGE_WIDTH: 250,
    MIN_IMAGE_HEIGHT: 180,

    // How much to scroll each time.
    SCROLL_MULTIPLIER: 0.75,
  },

  BROWSER: {
    HEADLESS: false,
    TIMEOUT: 60000,
  },

  DOWNLOAD: {
    TIMEOUT: 45000,
    MAX_REDIRECTS: 5,
    RETRIES: 3,
  },

  DUPLICATE: {
    // Perceptual hash comparison threshold.
    // Lower = stricter.
    PHASH_THRESHOLD: 6,
  },
};