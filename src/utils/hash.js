const crypto =
  require("crypto");

const fs =
  require("fs");

const sharp =
  require("sharp");

/**
 * SHA-256
 */
async function calculateSha256(
  filePath
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const hash =
        crypto.createHash(
          "sha256"
        );

      const stream =
        fs.createReadStream(
          filePath
        );

      stream.on(
        "error",
        reject
      );

      stream.on(
        "data",
        (chunk) => {
          hash.update(
            chunk
          );
        }
      );

      stream.on(
        "end",
        () => {
          resolve(
            hash.digest(
              "hex"
            )
          );
        }
      );
    }
  );
}

/**
 * Perceptual hash.
 *
 * The image should already have been
 * processed by Sharp before this function
 * is called.
 */
async function calculatePerceptualHash(
  filePath
) {
  const {
    data,
  } =
    await sharp(
      filePath
    )
      .resize(
        32,
        32,
        {
          fit: "fill",
        }
      )
      .grayscale()
      .raw()
      .toBuffer({
        resolveWithObject:
          true,
      });

  let total = 0;

  for (
    const value
    of data
  ) {
    total += value;
  }

  const average =
    total /
    data.length;

  let hash = "";

  for (
    const value
    of data
  ) {
    hash +=
      value >= average
        ? "1"
        : "0";
  }

  return hash;
}

module.exports = {
  calculateSha256,
  calculatePerceptualHash,
};