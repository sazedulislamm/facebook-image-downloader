const {
  isFacebookUiAsset,
} = require("./mediaDetector");

const config =
  require("../config/config");

const {
  logInfo,
} = require("../utils/logger");

function normalizeUrl(url) {
  if (!url) {
    return null;
  }

  try {
    const parsed =
      new URL(url);

    parsed.searchParams.delete("set");
    parsed.searchParams.delete("type");
    parsed.searchParams.delete("theater");
    parsed.searchParams.delete("refid");

    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Supported Facebook gallery URLs:
 *
 * Profile:
 *   https://www.facebook.com/username/photos
 *
 * Page:
 *   https://www.facebook.com/page/photos
 *
 * Group:
 *   https://www.facebook.com/groups/group-name/media
 */
function isSupportedGalleryUrl(pageUrl) {
  try {
    const parsed =
      new URL(pageUrl);

    const pathname =
      parsed.pathname.toLowerCase();

    /*
     * GROUP MEDIA
     */
    if (
      pathname.startsWith("/groups/") &&
      pathname.endsWith("/media")
    ) {
      return true;
    }

    /*
     * PROFILE / PAGE PHOTOS
     */
    if (
      pathname.endsWith("/photos")
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Determine gallery type.
 */
function getGalleryType(pageUrl) {
  try {
    const parsed =
      new URL(pageUrl);

    const pathname =
      parsed.pathname.toLowerCase();

    /*
     * GROUP
     */
    if (
      pathname.startsWith("/groups/") &&
      pathname.endsWith("/media")
    ) {
      return "group-media";
    }

    /*
     * PROFILE OR PAGE
     */
    if (
      pathname.endsWith("/photos")
    ) {
      return "profile-or-page";
    }

    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Extract Facebook photo ID from photo.php URL.
 */
function getFacebookPhotoId(url) {
  if (!url) {
    return null;
  }

  try {
    const parsed =
      new URL(url);

    if (
      parsed.hostname !==
      "www.facebook.com"
    ) {
      return null;
    }

    /*
     * Standard Facebook photo URL:
     *
     * /photo.php?fbid=123
     */
    if (
      parsed.pathname ===
      "/photo.php"
    ) {
      return (
        parsed.searchParams.get(
          "fbid"
        ) || null
      );
    }

    /*
     * Some Facebook links can appear as:
     *
     * /photo/?fbid=123
     */
    if (
      parsed.pathname ===
      "/photo/"
    ) {
      return (
        parsed.searchParams.get(
          "fbid"
        ) || null
      );
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check whether a URL is a Facebook photo URL.
 */
function isFacebookPhotoUrl(url) {
  if (!url) {
    return false;
  }

  try {
    const parsed =
      new URL(url);

    if (
      parsed.hostname !==
      "www.facebook.com"
    ) {
      return false;
    }

    const pathname =
      parsed.pathname.toLowerCase();

    if (
      pathname === "/photo.php" ||
      pathname === "/photo/"
    ) {
      return Boolean(
        parsed.searchParams.get(
          "fbid"
        )
      );
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Collect Facebook photo links from the currently loaded gallery.
 *
 * IMPORTANT:
 *
 * We deliberately support multiple Facebook DOM patterns.
 *
 * Page /photos commonly exposes:
 *
 *   /photo.php?fbid=...
 *
 * Group /media can expose:
 *
 *   /photo.php?fbid=...
 *   /photo/?fbid=...
 *
 * The rest of the pipeline is identical.
 */
async function collectGalleryPhotos(page) {
  return page.evaluate(() => {
    const results = [];
    const seen = new Set();

    /*
     * Facebook changes DOM structures frequently.
     *
     * Instead of depending on one exact CSS structure,
     * inspect all links on the page and identify Facebook
     * photo URLs from their href.
     */
    const links =
      document.querySelectorAll(
        "a[href]"
      );

    for (const link of links) {
      let href =
        link.href ||
        link.getAttribute("href");

      if (!href) {
        continue;
      }

      /*
       * Facebook sometimes uses relative URLs.
       */
      try {
        href =
          new URL(
            href,
            window.location.origin
          ).href;
      } catch {
        continue;
      }

      let parsed;

      try {
        parsed =
          new URL(href);
      } catch {
        continue;
      }

      if (
        parsed.hostname !==
        "www.facebook.com"
      ) {
        continue;
      }

      const pathname =
        parsed.pathname.toLowerCase();

      /*
       * Accept both common Facebook photo URL forms.
       */
      if (
        pathname !==
          "/photo.php" &&
        pathname !==
          "/photo/"
      ) {
        continue;
      }

      const photoId =
        parsed.searchParams.get(
          "fbid"
        );

      if (!photoId) {
        continue;
      }

      if (
        seen.has(photoId)
      ) {
        continue;
      }

      /*
       * Only consider actual photo IDs.
       */
      seen.add(photoId);

      /*
       * Try to find the image belonging to this
       * gallery link.
       */
      const image =
        link.querySelector(
          "img"
        );

      let src = null;
      let width = 0;
      let height = 0;

      if (image) {
        src =
          image.currentSrc ||
          image.src ||
          image.getAttribute(
            "src"
          ) ||
          image.getAttribute(
            "data-src"
          ) ||
          image.getAttribute(
            "data-original"
          );

        width =
          image.naturalWidth ||
          Number(
            image.getAttribute(
              "width"
            )
          ) ||
          image.width ||
          0;

        height =
          image.naturalHeight ||
          Number(
            image.getAttribute(
              "height"
            )
          ) ||
          image.height ||
          0;
      }

      /*
       * Even if there is no img directly inside the
       * anchor, keep the photo URL.
       *
       * The resolver will open photo.php?fbid and
       * find the actual highest-resolution image.
       */
      results.push({
        photoId,
        src,
        width,
        height,
        photoUrl: href,
      });
    }

    /*
     * SECOND PASS
     *
     * Facebook can sometimes render photo links inside
     * elements where the <a> is not immediately obvious
     * through the expected structure.
     *
     * Inspect all elements containing an href-like
     * Facebook photo URL.
     */
    const elements =
      document.querySelectorAll(
        "[href]"
      );

    for (const element of elements) {
      let href =
        element.getAttribute(
          "href"
        );

      if (!href) {
        continue;
      }

      try {
        href =
          new URL(
            href,
            window.location.origin
          ).href;
      } catch {
        continue;
      }

      let parsed;

      try {
        parsed =
          new URL(href);
      } catch {
        continue;
      }

      if (
        parsed.hostname !==
        "www.facebook.com"
      ) {
        continue;
      }

      const pathname =
        parsed.pathname.toLowerCase();

      if (
        pathname !==
          "/photo.php" &&
        pathname !==
          "/photo/"
      ) {
        continue;
      }

      const photoId =
        parsed.searchParams.get(
          "fbid"
        );

      if (!photoId) {
        continue;
      }

      if (
        seen.has(photoId)
      ) {
        continue;
      }

      seen.add(photoId);

      let image =
        null;

      if (
        element.tagName &&
        element.tagName.toLowerCase() ===
          "img"
      ) {
        image = element;
      } else {
        image =
          element.querySelector &&
          element.querySelector(
            "img"
          );
      }

      const src =
        image
          ? (
              image.currentSrc ||
              image.src ||
              image.getAttribute(
                "src"
              ) ||
              image.getAttribute(
                "data-src"
              ) ||
              image.getAttribute(
                "data-original"
              )
            )
          : null;

      const width =
        image
          ? (
              image.naturalWidth ||
              Number(
                image.getAttribute(
                  "width"
                )
              ) ||
              image.width ||
              0
            )
          : 0;

      const height =
        image
          ? (
              image.naturalHeight ||
              Number(
                image.getAttribute(
                  "height"
                )
              ) ||
              image.height ||
              0
            )
          : 0;

      results.push({
        photoId,
        src,
        width,
        height,
        photoUrl: href,
      });
    }

    return results;
  });
}

/**
 * Fallback image collector.
 *
 * This is only used when a visible Facebook image
 * cannot be associated with photo.php?fbid.
 *
 * The preferred path is always photo.php?fbid.
 */
async function collectFallbackImages(page) {
  return page.evaluate(() => {
    const results = [];

    const images =
      document.querySelectorAll(
        "img"
      );

    for (const image of images) {
      const src =
        image.currentSrc ||
        image.src ||
        image.getAttribute(
          "src"
        ) ||
        image.getAttribute(
          "data-src"
        ) ||
        image.getAttribute(
          "data-original"
        );

      if (!src) {
        continue;
      }

      const width =
        image.naturalWidth ||
        Number(
          image.getAttribute(
            "width"
          )
        ) ||
        image.width ||
        0;

      const height =
        image.naturalHeight ||
        Number(
          image.getAttribute(
            "height"
          )
        ) ||
        image.height ||
        0;

      if (
        width < 250 ||
        height < 180
      ) {
        continue;
      }

      results.push({
        src,
        width,
        height,
        photoUrl: null,
      });
    }

    return results;
  });
}

/**
 * Normalize and deduplicate discovered candidates.
 */
function normalizeGalleryCandidates(
  galleryCandidates,
  fallbackCandidates,
  seenIds,
  seenUrls
) {
  const results = [];

  /*
   * PRIMARY:
   *
   * photo.php?fbid
   *
   * These are the candidates that go through:
   *
   * photo.php
   *     ↓
   * highest-resolution resolver
   *     ↓
   * downloader
   */
  for (
    const candidate
    of galleryCandidates
  ) {
    const photoId =
      candidate.photoId;

    if (!photoId) {
      continue;
    }

    const normalizedSrc =
      normalizeUrl(
        candidate.src
      );

    /*
     * A photo ID is the important identifier.
     *
     * src may be null and that is okay because
     * photoUrl is enough for the resolver.
     */
    if (
      seenIds.has(photoId)
    ) {
      continue;
    }

    if (
      normalizedSrc &&
      isFacebookUiAsset(
        normalizedSrc
      )
    ) {
      /*
       * Do NOT reject the photo just because its
       * thumbnail URL looks like a Facebook asset.
       *
       * The actual image will be resolved from
       * photo.php?fbid.
       */
    }

    seenIds.add(photoId);

    results.push({
      id:
        `facebook-photo-${photoId}`,

      photoId,

      /*
       * Thumbnail if available.
       *
       * The worker should prefer photoUrl.
       */
      src:
        normalizedSrc,

      width:
        candidate.width || 0,

      height:
        candidate.height || 0,

      photoUrl:
        candidate.photoUrl,
    });
  }

  /*
   * SECONDARY FALLBACK:
   *
   * Only images that could not be associated with
   * a photo.php?fbid URL are handled here.
   */
  for (
    const candidate
    of fallbackCandidates
  ) {
    const normalizedSrc =
      normalizeUrl(
        candidate.src
      );

    if (!normalizedSrc) {
      continue;
    }

    if (
      isFacebookUiAsset(
        normalizedSrc
      )
    ) {
      continue;
    }

    if (
      seenUrls.has(
        normalizedSrc
      )
    ) {
      continue;
    }

    seenUrls.add(
      normalizedSrc
    );

    results.push({
      id:
        `facebook-image-${Buffer
          .from(normalizedSrc)
          .toString("base64")
          .slice(0, 40)}`,

      photoId:
        null,

      src:
        normalizedSrc,

      width:
        candidate.width || 0,

      height:
        candidate.height || 0,

      photoUrl:
        candidate.photoUrl || null,
    });
  }

  return results;
}

/**
 * Scroll Facebook gallery and yield images.
 *
 * This works for:
 *
 * Profile:
 *   /username/photos
 *
 * Page:
 *   /page/photos
 *
 * Group:
 *   /groups/group/media
 *
 * The image processing pipeline after this function
 * is identical for all three.
 */
async function* crawlImages(
  page,
  pageUrl
) {
  if (
    !isSupportedGalleryUrl(
      pageUrl
    )
  ) {
    throw new Error(
      "Unsupported Facebook gallery URL."
    );
  }

  const galleryType =
    getGalleryType(
      pageUrl
    );

  logInfo(
    `Gallery type: ${galleryType}`
  );

  /*
   * Open the requested gallery directly.
   */
  await page.goto(
    pageUrl,
    {
      waitUntil:
        "domcontentloaded",

      timeout:
        config.BROWSER.TIMEOUT,
    }
  );

  /*
   * Give Facebook time to render
   * the initial gallery.
   */
  await page.waitForTimeout(
    4000
  );

  logInfo(
    `Opened Facebook gallery: ${pageUrl}`
  );

  const seenIds =
    new Set();

  const seenUrls =
    new Set();

  let idleScans = 0;

  let previousHeight = 0;

  /*
   * Keep scrolling until Facebook stops
   * loading new gallery content.
   */
  for (
    let scan = 1;
    scan <=
    config.SCRAPER.MAX_SCROLLS;
    scan++
  ) {
    /*
     * Find actual photo.php?fbid links.
     */
    const galleryCandidates =
      await collectGalleryPhotos(
        page
      );

    /*
     * Fallback visible images.
     */
    const fallbackCandidates =
      await collectFallbackImages(
        page
      );

    /*
     * Normalize and remove duplicates.
     */
    const newImages =
      normalizeGalleryCandidates(
        galleryCandidates,
        fallbackCandidates,
        seenIds,
        seenUrls
      );

    /*
     * Send each newly discovered image
     * to the worker queue.
     */
    for (
      const image
      of newImages
    ) {
      yield image;
    }

    const currentHeight =
      await page.evaluate(
        () =>
          document.documentElement
            .scrollHeight
      );

    logInfo(
      `Gallery scan ${scan}: ` +
        `${galleryCandidates.length} gallery candidates | ` +
        `${newImages.length} new images | ` +
        `total ${
          seenIds.size +
          seenUrls.size
        } | ` +
        `height ${currentHeight}px`
    );

    /*
     * Detect whether Facebook stopped
     * loading additional content.
     */
    if (
      newImages.length === 0 &&
      currentHeight ===
        previousHeight
    ) {
      idleScans++;
    } else {
      idleScans = 0;
    }

    previousHeight =
      currentHeight;

    /*
     * Randomized delay between scrolls.
     */
    const delay =
      Math.floor(
        Math.random() *
          (
            config.SCRAPER
              .SCROLL_DELAY_MAX -
            config.SCRAPER
              .SCROLL_DELAY_MIN
          )
      ) +
      config.SCRAPER
        .SCROLL_DELAY_MIN;

    /*
     * Scroll down.
     */
    await page.evaluate(
      () => {
        window.scrollBy({
          top:
            window.innerHeight *
            0.85,

          behavior:
            "smooth",
        });
      }
    );

    /*
     * Wait for smooth scrolling.
     */
    await page.waitForTimeout(
      1200
    );

    /*
     * Wait for Facebook to load
     * more gallery items.
     */
    await page.waitForTimeout(
      delay
    );

    /*
     * Stop only after many completely
     * idle scans.
     */
    if (
      idleScans >=
      config.SCRAPER.MAX_IDLE_SCROLLS
    ) {
      logInfo(
        "Gallery appears exhausted. " +
          `No new images for ${
            config.SCRAPER.MAX_IDLE_SCROLLS
          } scans.`
      );

      break;
    }
  }

  logInfo(
    `Gallery crawl completed. ` +
      `Images discovered: ${
        seenIds.size +
        seenUrls.size
      }`
  );
}

module.exports = {
  normalizeUrl,
  isSupportedGalleryUrl,
  getGalleryType,
  getFacebookPhotoId,
  isFacebookPhotoUrl,
  collectGalleryPhotos,
  collectFallbackImages,
  normalizeGalleryCandidates,
  crawlImages,
};