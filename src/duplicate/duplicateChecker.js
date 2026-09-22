const sharp = require("sharp");

const {
  calculateFileHash,
} = require("../utils/hash");

const {
  hasHash,
  getImageByHash,
  hasPerceptualHash,
} = require("../storage/database");

const config = require("../config/config");


async function calculatePerceptualHash(
  filePath
) {
  const { data } = await sharp(filePath)
    .resize(32, 32, {
      fit: "fill",
    })
    .grayscale()
    .raw()
    .toBuffer({
      resolveWithObject: true,
    });

  let total = 0;

  for (const value of data) {
    total += value;
  }

  const average =
    total / data.length;

  let hash = "";

  for (const value of data) {
    hash += value >= average ? "1" : "0";
  }

  return hash;
}


async function isDuplicate(
  filePath,
  database
) {
  const hash =
    await calculateFileHash(filePath);

  // Exact duplicate.
  if (hasHash(database, hash)) {
    return {
      isDuplicate: true,
      hash,
      perceptualHash: null,
      existingImage:
        getImageByHash(
          database,
          hash
        ),
      reason: "exact-hash",
    };
  }

  // Visual duplicate.
  const perceptualHash =
    await calculatePerceptualHash(
      filePath
    );

  const visualMatch =
    hasPerceptualHash(
      database,
      perceptualHash,
      config.DUPLICATE.PHASH_THRESHOLD
    );

  if (visualMatch) {
    return {
      isDuplicate: true,
      hash,
      perceptualHash,
      existingImage: visualMatch,
      reason: "visual-match",
    };
  }

  return {
    isDuplicate: false,
    hash,
    perceptualHash,
    existingImage: null,
    reason: null,
  };
}


module.exports = {
  calculatePerceptualHash,
  isDuplicate,
};