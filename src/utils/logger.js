function timestamp() {
  return new Date().toISOString();
}

function logInfo(message) {
  console.log(`[${timestamp()}] [INFO] ${message}`);
}

function logSuccess(message) {
  console.log(`[${timestamp()}] [SUCCESS] ${message}`);
}

function logWarning(message) {
  console.warn(`[${timestamp()}] [WARNING] ${message}`);
}

function logError(message) {
  console.error(`[${timestamp()}] [ERROR] ${message}`);
}

module.exports = {
  logInfo,
  logSuccess,
  logWarning,
  logError,
};