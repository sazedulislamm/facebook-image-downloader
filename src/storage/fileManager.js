const fs = require("fs");
const path = require("path");

async function ensureDirectory(directoryPath) {
  if (!directoryPath) {
    throw new Error("Directory path is undefined.");
  }

  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, {
      recursive: true,
    });
  }
}

async function ensureDirectories() {
  const config = require("../config/config");

  await ensureDirectory(config.DATA_DIR);
  await ensureDirectory(config.DOWNLOAD_DIR);
  await ensureDirectory(config.LOG_DIR);
}

async function fileExists(filePath) {
  return fs.existsSync(filePath);
}

async function deleteFile(filePath) {
  if (!filePath) {
    return;
  }

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

async function moveFile(sourcePath, destinationPath) {
  const destinationDirectory = path.dirname(destinationPath);

  await ensureDirectory(destinationDirectory);
  await deleteFile(destinationPath);

  fs.renameSync(sourcePath, destinationPath);
}

function createTempPath(directory, prefix, extension = "tmp") {
  const filename = `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${extension}`;

  return path.join(directory, filename);
}

module.exports = {
  ensureDirectory,
  ensureDirectories,
  fileExists,
  deleteFile,
  moveFile,
  createTempPath,
};