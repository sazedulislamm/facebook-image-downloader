const {
  downloadImage,
} = require("../downloader/imageDownloader");

const {
  sanitizeImageAutomatically,
} = require("../processor/imageProcessor");

const {
  calculateSha256,
  calculatePerceptualHash,
} = require("../utils/hash");

const {
  loadDatabase,
  hasHash,
  hasPerceptualHash,
  addImage,
} = require("../storage/database");

const {
  deleteFile,
  createTempPath,
  ensureDirectory,
} = require("../storage/fileManager");

const {
  createImageFilename,
} = require("../utils/filename");

const {
  createPhotoResolver,
} = require("../scraper/facebookPhotoResolver");

const config = require("../config/config");

const {
  logInfo,
  logSuccess,
  logWarning,
  logError,
} = require("../utils/logger");

async function runImageWorker(
  queue,
  workerId,
  context,
  counters
) {
  const resolver =
    await createPhotoResolver(context);

  try {
    while (true) {
      const item = await queue.get();

      if (!item) {
        break;
      }

      const {
        image,
        imageNumber,
        pageUrl,
      } = item;

      let downloadedPath = null;
      let cleanPath = null;

      try {
        let downloadUrl = image.src;
        let resolvedPhotoUrl =
          image.photoUrl;

        // For actual Facebook photos, open the
        // individual photo page and find the
        // highest-resolution accessible image.
        if (image.photoUrl) {
          try {
            const resolved =
              await resolver.resolve(
                image.photoUrl
              );

            downloadUrl =
              resolved.url;

            resolvedPhotoUrl =
              image.photoUrl;
          } catch (error) {
            logWarning(
              `[Worker ${workerId}] ` +
              `Could not resolve photo ${image.photoId}: ` +
              `${error.message}`
            );

            // Do not lose the image completely.
            // Fall back to the gallery image.
            downloadUrl =
              image.src;
          }
        }

        logInfo(
          `[Worker ${workerId}] Downloading image #${imageNumber}`
        );

        const downloaded =
          await downloadImage(
            downloadUrl,
            config.DOWNLOAD_DIR,
            imageNumber
          );

        downloadedPath =
          downloaded.filePath;

        logInfo(
          `[Worker ${workerId}] ` +
          `Downloaded original: ${downloaded.fileName}`
        );

        // ----------------------------------------
        // Sharp
        // 224x224 + metadata removal
        // ----------------------------------------

        const cleanExtension =
          downloaded.extension;

        const cleanFilename =
          createImageFilename(
            imageNumber,
            cleanExtension
          );

        cleanPath =
          createTempPath(
            config.DOWNLOAD_DIR,
            `clean-${imageNumber}`,
            cleanExtension
          );

        await sanitizeImageAutomatically(
          downloadedPath,
          cleanPath
        );

        // Replace original with sanitized file.
        await deleteFile(
          downloadedPath
        );

        const finalPath =
          require("path").join(
            config.DOWNLOAD_DIR,
            cleanFilename
          );

        await deleteFile(finalPath);

        require("fs").renameSync(
          cleanPath,
          finalPath
        );

        cleanPath = null;

        // ----------------------------------------
        // Hash AFTER Sharp
        // ----------------------------------------

        const hash =
          await calculateSha256(
            finalPath
          );

        const perceptualHash =
          await calculatePerceptualHash(
            finalPath
          );

        const database =
          await loadDatabase();

        // Exact duplicate
        if (hasHash(database, hash)) {
          counters.duplicates++;

          logWarning(
            `[Worker ${workerId}] ` +
            `Exact duplicate: ${cleanFilename}`
          );

          await deleteFile(finalPath);

          continue;
        }

        // Similar duplicate
        const similar =
          hasPerceptualHash(
            database,
            perceptualHash,
            config.DUPLICATE.PHASH_THRESHOLD
          );

        if (similar) {
          counters.duplicates++;

          logWarning(
            `[Worker ${workerId}] ` +
            `Similar duplicate: ${cleanFilename}`
          );

          await deleteFile(finalPath);

          continue;
        }

        // ----------------------------------------
        // Save database record
        // ----------------------------------------

        await addImage(
          database,
          {
            id: image.id,

            photoId:
              image.photoId || null,

            sourceUrl:
              downloadUrl,

            photoUrl:
              resolvedPhotoUrl || null,

            pageUrl,

            fileName:
              cleanFilename,

            filePath:
              finalPath,

            hash,

            perceptualHash,

            width: 224,

            height: 224,

            createdAt:
              new Date().toISOString(),
          }
        );

        counters.downloaded++;

        logSuccess(
          `[Worker ${workerId}] ` +
          `Saved: ${cleanFilename}`
        );
      } catch (error) {
        counters.failed++;

        logError(
          `[Worker ${workerId}] ` +
          `Failed image #${imageNumber}: ` +
          error.message
        );

        if (downloadedPath) {
          await deleteFile(
            downloadedPath
          );
        }

        if (cleanPath) {
          await deleteFile(
            cleanPath
          );
        }
      }
    }
  } finally {
    await resolver.close();

    logInfo(
      `[Worker ${workerId}] Worker finished.`
    );
  }
}

module.exports = {
  runImageWorker,
};