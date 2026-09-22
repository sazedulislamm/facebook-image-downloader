const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const {
  logInfo,
  logWarning,
} = require("../utils/logger");

const config =
  require("../config/config");

/*
 * ----------------------------------------
 * USER AGENT
 * ----------------------------------------
 */

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/153.0.0.0 Safari/537.36";

/*
 * ----------------------------------------
 * SLEEP
 * ----------------------------------------
 */

function sleep(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  );
}

/*
 * ----------------------------------------
 * GET EXTENSION
 * ----------------------------------------
 */

function getExtensionFromContentType(
  contentType
) {
  if (!contentType) {
    return null;
  }

  const type =
    contentType
      .split(";")[0]
      .trim()
      .toLowerCase();

  const extensions = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/bmp": "bmp",
    "image/tiff": "tiff",
    "image/avif": "avif",
  };

  return (
    extensions[type] ||
    null
  );
}

/*
 * ----------------------------------------
 * DOWNLOAD HTTP
 * ----------------------------------------
 */

function requestImage(
  url,
  redirects = 0
) {
  return new Promise(
    (resolve, reject) => {
      if (
        redirects >
        config.DOWNLOAD
          .MAX_REDIRECTS
      ) {
        reject(
          new Error(
            "Maximum redirects exceeded."
          )
        );

        return;
      }

      let parsedUrl;

      try {
        parsedUrl =
          new URL(url);
      } catch {
        reject(
          new Error(
            "Invalid image URL."
          )
        );

        return;
      }

      const client =
        parsedUrl.protocol ===
        "https:"
          ? https
          : http;

      const request =
        client.get(
          parsedUrl,
          {
            headers: {
              "User-Agent":
                USER_AGENT,

              Accept:
                "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",

              Referer:
                "https://www.facebook.com/",
            },

            timeout:
              config.DOWNLOAD
                .TIMEOUT,
          },
          (response) => {
            /*
             * --------------------------------
             * REDIRECT
             * --------------------------------
             */

            if (
              response.statusCode >=
                300 &&
              response.statusCode <
                400 &&
              response.headers
                .location
            ) {
              response.resume();

              const redirectUrl =
                new URL(
                  response.headers.location,
                  parsedUrl
                ).toString();

              requestImage(
                redirectUrl,
                redirects + 1
              )
                .then(resolve)
                .catch(reject);

              return;
            }

            /*
             * --------------------------------
             * STATUS
             * --------------------------------
             */

            if (
              !response.statusCode ||
              response.statusCode < 200 ||
              response.statusCode >=
                300
            ) {
              response.resume();

              reject(
                new Error(
                  `HTTP ${response.statusCode}`
                )
              );

              return;
            }

            /*
             * --------------------------------
             * CONTENT TYPE
             * --------------------------------
             */

            const contentType =
              response.headers[
                "content-type"
              ] || "";

            const extension =
              getExtensionFromContentType(
                contentType
              );

            if (!extension) {
              response.resume();

              reject(
                new Error(
                  `URL did not return a supported image. Content-Type: ${contentType}`
                )
              );

              return;
            }

            /*
             * --------------------------------
             * COLLECT DATA
             * --------------------------------
             */

            const chunks = [];

            response.on(
              "data",
              (chunk) => {
                chunks.push(
                  chunk
                );
              }
            );

            response.on(
              "end",
              () => {
                const buffer =
                  Buffer.concat(
                    chunks
                  );

                if (
                  !buffer.length
                ) {
                  reject(
                    new Error(
                      "Downloaded image is empty."
                    )
                  );

                  return;
                }

                resolve({
                  buffer,
                  extension,
                  contentType,
                  finalUrl:
                    parsedUrl.toString(),
                });
              }
            );

            response.on(
              "error",
              reject
            );
          }
        );

      request.on(
        "timeout",
        () => {
          request.destroy(
            new Error(
              "Download request timed out."
            )
          );
        }
      );

      request.on(
        "error",
        reject
      );
    }
  );
}

/*
 * ----------------------------------------
 * DOWNLOAD WITH RETRIES
 * ----------------------------------------
 */

async function downloadWithRetry(
  url
) {
  let lastError = null;

  const retries =
    config.DOWNLOAD.RETRIES;

  for (
    let attempt = 1;
    attempt <= retries;
    attempt++
  ) {
    try {
      logInfo(
        `Downloading image (attempt ${attempt}/${retries})`
      );

      return await requestImage(
        url
      );
    } catch (error) {
      lastError =
        error;

      logWarning(
        `Download attempt ${attempt} failed: ${error.message}`
      );

      if (
        attempt <
        retries
      ) {
        await sleep(
          1000 * attempt
        );
      }
    }
  }

  throw (
    lastError ||
    new Error(
      "Image download failed."
    )
  );
}

/*
 * ----------------------------------------
 * DOWNLOAD IMAGE
 * ----------------------------------------
 *
 * Signature:
 *
 * downloadImage(
 *   imageUrl,
 *   downloadDirectory,
 *   imageNumber
 * )
 */

async function downloadImage(
  imageUrl,
  downloadDirectory,
  imageNumber
) {
  if (!imageUrl) {
    throw new Error(
      "Image URL is missing."
    );
  }

  if (!downloadDirectory) {
    throw new Error(
      "Download directory is missing."
    );
  }

  /*
   * Make sure downloads directory exists.
   */

  await fs.promises.mkdir(
    downloadDirectory,
    {
      recursive: true,
    }
  );

  /*
   * ----------------------------------------
   * DOWNLOAD IMAGE
   * ----------------------------------------
   */

  const result =
    await downloadWithRetry(
      imageUrl
    );

  /*
   * ----------------------------------------
   * CREATE FILE NAME
   * ----------------------------------------
   */

  const fileName =
    `image-${String(
      imageNumber
    ).padStart(
      3,
      "0"
    )}.${result.extension}`;

  /*
   * IMPORTANT:
   *
   * Previously the directory itself
   * was being passed as the file path.
   *
   * Now we create the complete path.
   */

  const filePath =
    path.join(
      downloadDirectory,
      fileName
    );

  /*
   * ----------------------------------------
   * WRITE FILE
   * ----------------------------------------
   */

  await fs.promises.writeFile(
    filePath,
    result.buffer
  );

  logInfo(
    `Downloaded: ${fileName}`
  );

  return {
    filePath,
    fileName,
    extension:
      result.extension,
    contentType:
      result.contentType,
    sourceUrl:
      imageUrl,
    finalUrl:
      result.finalUrl,
  };
}

module.exports = {
  downloadImage,
};