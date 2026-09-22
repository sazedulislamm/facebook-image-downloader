const fs = require("fs");
const path = require("path");

const config = require("../config/config");

const DATABASE_FILE = config.DATABASE_FILE;

function ensureDatabase() {
  const databaseDirectory =
    path.dirname(DATABASE_FILE);

  if (!fs.existsSync(databaseDirectory)) {
    fs.mkdirSync(databaseDirectory, {
      recursive: true,
    });
  }

  if (!fs.existsSync(DATABASE_FILE)) {
    fs.writeFileSync(
      DATABASE_FILE,
      JSON.stringify(
        {
          images: [],
        },
        null,
        2
      ),
      "utf8"
    );
  }
}

async function loadDatabase() {
  ensureDatabase();

  try {
    const content = fs.readFileSync(
      DATABASE_FILE,
      "utf8"
    ).trim();

    if (!content) {
      const database = {
        images: [],
      };

      await saveDatabase(database);

      return database;
    }

    const database = JSON.parse(content);

    if (!Array.isArray(database.images)) {
      database.images = [];
    }

    return database;
  } catch (error) {
    console.warn(
      `Failed to load database: ${error.message}`
    );

    const database = {
      images: [],
    };

    await saveDatabase(database);

    return database;
  }
}

async function saveDatabase(database) {
  ensureDatabase();

  const temporaryFile =
    `${DATABASE_FILE}.tmp`;

  fs.writeFileSync(
    temporaryFile,
    JSON.stringify(
      database,
      null,
      2
    ),
    "utf8"
  );

  fs.renameSync(
    temporaryFile,
    DATABASE_FILE
  );
}

function hasHash(database, hash) {
  return database.images.some(
    (image) => image.hash === hash
  );
}

function getImageByHash(database, hash) {
  return (
    database.images.find(
      (image) => image.hash === hash
    ) || null
  );
}

function hasPerceptualHash(
  database,
  perceptualHash,
  threshold
) {
  if (!perceptualHash) {
    return null;
  }

  for (const image of database.images) {
    if (!image.perceptualHash) {
      continue;
    }

    const distance =
      hammingDistance(
        perceptualHash,
        image.perceptualHash
      );

    if (distance <= threshold) {
      return image;
    }
  }

  return null;
}

function hammingDistance(hashA, hashB) {
  if (
    !hashA ||
    !hashB ||
    hashA.length !== hashB.length
  ) {
    return Infinity;
  }

  let distance = 0;

  for (let i = 0; i < hashA.length; i++) {
    if (hashA[i] !== hashB[i]) {
      distance++;
    }
  }

  return distance;
}

async function addImage(
  database,
  imageRecord
) {
  database.images.push(imageRecord);

  await saveDatabase(database);
}

module.exports = {
  ensureDatabase,
  loadDatabase,
  saveDatabase,
  hasHash,
  getImageByHash,
  hasPerceptualHash,
  addImage,
};