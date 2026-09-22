const fs = require("fs");

function getNextImageNumber(downloadDir) {
  if (!fs.existsSync(downloadDir)) {
    return 1;
  }

  const files =
    fs.readdirSync(downloadDir);

  let highestNumber = 0;

  for (
    const file of files
  ) {
    const match =
      file.match(
        /^image-(\d+)\./i
      );

    if (match) {
      const number =
        parseInt(
          match[1],
          10
        );

      if (
        number >
        highestNumber
      ) {
        highestNumber =
          number;
      }
    }
  }

  return (
    highestNumber + 1
  );
}

function createImageFilename(
  number,
  extension
) {
  const cleanExtension =
    String(extension)
      .replace(
        /^\./,
        ""
      );

  return (
    `image-${String(number)
      .padStart(3, "0")}.${cleanExtension}`
  );
}

module.exports = {
  getNextImageNumber,
  createImageFilename,
};