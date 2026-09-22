const sharp = require("sharp");

async function getImageFormat(inputPath) {
  const metadata = await sharp(inputPath).metadata();

  return metadata.format;
}

async function sanitizeImage(inputPath, outputPath, format) {
  const image = sharp(inputPath)
    .resize(224, 224, {
      fit: "fill",
      withoutEnlargement: false,
    });

  switch (format) {
    case "jpeg":
    case "jpg":
      await image
        .jpeg({
          quality: 100,
          mozjpeg: true,
        })
        .toFile(outputPath);
      break;

    case "png":
      await image
        .png({
          compressionLevel: 9,
          adaptiveFiltering: true,
        })
        .toFile(outputPath);
      break;

    case "webp":
      await image
        .webp({
          quality: 100,
          lossless: true,
        })
        .toFile(outputPath);
      break;

    default:
      throw new Error(
        `Unsupported downloaded format: ${format}`
      );
  }
}

async function sanitizeImageAutomatically(
  inputPath,
  outputPath
) {
  const format = await getImageFormat(inputPath);

  let outputFormat;

  switch (format) {
    case "jpeg":
      outputFormat = "jpeg";
      break;

    case "png":
      outputFormat = "png";
      break;

    case "webp":
      outputFormat = "webp";
      break;

    default:
      throw new Error(
        `Unsupported downloaded format: ${format}`
      );
  }

  await sanitizeImage(
    inputPath,
    outputPath,
    outputFormat
  );

  return outputFormat;
}

module.exports = {
  getImageFormat,
  sanitizeImage,
  sanitizeImageAutomatically,
};