const config = require("../config/config");
const { isFacebookUiAsset } = require("./mediaDetector");
const { logInfo, logWarning } = require("../utils/logger");

function isValidImageUrl(url) {
  if (!url) {
    return false;
  }

  if (isFacebookUiAsset(url)) {
    return false;
  }

  try {
    const parsed = new URL(url);

    return (
      parsed.protocol === "https:" &&
      (
        parsed.hostname.includes("fbcdn.net") ||
        parsed.hostname.includes("fbsbx.com") ||
        parsed.hostname === "facebook.com" ||
        parsed.hostname.endsWith(".facebook.com")
      )
    );
  } catch {
    return false;
  }
}

function parseSrcset(srcset) {
  if (!srcset) {
    return [];
  }

  return srcset
    .split(",")
    .map((entry) => {
      const parts = entry.trim().split(/\s+/);

      const url = parts[0];

      let width = 0;

      if (parts[1] && parts[1].endsWith("w")) {
        width = parseInt(
          parts[1].slice(0, -1),
          10
        ) || 0;
      }

      return {
        url,
        width,
      };
    })
    .filter((item) => isValidImageUrl(item.url));
}

async function inspectPage(page) {
  return page.evaluate(() => {
    const candidates = [];

    function addCandidate(
      url,
      width = 0,
      height = 0,
      source = "unknown"
    ) {
      if (!url) {
        return;
      }

      candidates.push({
        url,
        width: Number(width) || 0,
        height: Number(height) || 0,
        source,
      });
    }

    // Images currently rendered on the photo page.
    for (const image of document.querySelectorAll("img")) {
      addCandidate(
        image.currentSrc ||
          image.src,

        image.naturalWidth ||
          image.width ||
          0,

        image.naturalHeight ||
          image.height ||
          0,

        "img"
      );

      const srcset =
        image.getAttribute("srcset");

      if (srcset) {
        for (const item of srcset.split(",")) {
          const parts = item.trim().split(/\s+/);

          if (!parts[0]) {
            continue;
          }

          const width =
            parts[1] &&
            parts[1].endsWith("w")
              ? parseInt(
                  parts[1].slice(0, -1),
                  10
                ) || 0
              : 0;

          addCandidate(
            parts[0],
            width,
            0,
            "srcset"
          );
        }
      }
    }

    // Open Graph image.
    const ogImage =
      document.querySelector(
        'meta[property="og:image"]'
      );

    if (ogImage) {
      addCandidate(
        ogImage.content,
        0,
        0,
        "og:image"
      );
    }

    // image_src.
    const imageSrc =
      document.querySelector(
        'link[rel="image_src"]'
      );

    if (imageSrc) {
      addCandidate(
        imageSrc.href,
        0,
        0,
        "image_src"
      );
    }

    return candidates;
  });
}

function calculateScore(candidate) {
  const width = Number(candidate.width) || 0;
  const height = Number(candidate.height) || 0;

  const area =
    width > 0 && height > 0
      ? width * height
      : 0;

  let score = area;

  if (candidate.source === "img") {
    score += 1000000;
  }

  if (candidate.source === "srcset") {
    score += 500000;
  }

  if (candidate.source === "og:image") {
    score += 100000;
  }

  return score;
}

function chooseBestCandidate(candidates) {
  const valid = candidates
    .filter((candidate) =>
      isValidImageUrl(candidate.url)
    )
    .map((candidate) => ({
      ...candidate,
      score: calculateScore(candidate),
    }));

  if (valid.length === 0) {
    return null;
  }

  valid.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    return (
      (b.width || 0) -
      (a.width || 0)
    );
  });

  return valid[0];
}

function deduplicateCandidates(candidates) {
  const map = new Map();

  for (const candidate of candidates) {
    if (!candidate.url) {
      continue;
    }

    if (!map.has(candidate.url)) {
      map.set(candidate.url, candidate);
      continue;
    }

    const existing = map.get(candidate.url);

    if (
      calculateScore(candidate) >
      calculateScore(existing)
    ) {
      map.set(candidate.url, candidate);
    }
  }

  return Array.from(map.values());
}

async function createPhotoResolver(context) {
  const page = await context.newPage();

  page.setDefaultTimeout(
    config.BROWSER.TIMEOUT
  );

  async function resolve(photoUrl) {
    if (!photoUrl) {
      throw new Error(
        "Photo URL is missing."
      );
    }

    logInfo(
      `Resolving highest-resolution image: ${photoUrl}`
    );

    await page.goto(photoUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.BROWSER.TIMEOUT,
    });

    await page.waitForTimeout(2500);

    // Give lazy-loaded photo elements time to appear.
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });

    await page.waitForTimeout(1000);

    let candidates =
      await inspectPage(page);

    candidates =
      deduplicateCandidates(
        candidates
      );

    let best =
      chooseBestCandidate(
        candidates
      );

    // Sometimes the main image loads after the
    // initial DOM inspection.
    if (
      !best ||
      !best.width ||
      !best.height
    ) {
      await page.waitForTimeout(2000);

      candidates =
        await inspectPage(page);

      candidates =
        deduplicateCandidates(
          candidates
        );

      best =
        chooseBestCandidate(
          candidates
        );
    }

    if (!best) {
      throw new Error(
        "Could not find an accessible image on the Facebook photo page."
      );
    }

    logInfo(
      `Selected image: ${best.width || "unknown"}x${
        best.height || "unknown"
      } (${best.source})`
    );

    return {
      url: best.url,
      width: best.width,
      height: best.height,
      source: best.source,
      photoUrl,
    };
  }

  async function close() {
    try {
      await page.close();
    } catch (error) {
      logWarning(
        `Could not close photo resolver page: ${error.message}`
      );
    }
  }

  return {
    resolve,
    close,
  };
}

module.exports = {
  createPhotoResolver,
  parseSrcset,
  chooseBestCandidate,
};