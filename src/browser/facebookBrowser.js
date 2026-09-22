const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { chromium } = require("playwright");

const config = require("../config/config");

const {
  logInfo,
  logSuccess,
  logWarning,
} = require("../utils/logger");

/*
 * ----------------------------------------
 * PATHS
 * ----------------------------------------
 */

const ROOT_DIR = path.resolve(
  __dirname,
  "../.."
);

const CHROME_SESSIONS_DIR = path.join(
  ROOT_DIR,
  "chrome-sessions"
);

/*
 * Chrome executable locations on Windows.
 */

const CHROME_PATHS = [
  path.join(
    process.env.PROGRAMFILES || "",
    "Google",
    "Chrome",
    "Application",
    "chrome.exe"
  ),

  path.join(
    process.env["PROGRAMFILES(X86)"] || "",
    "Google",
    "Chrome",
    "Application",
    "chrome.exe"
  ),

  path.join(
    process.env.LOCALAPPDATA || "",
    "Google",
    "Chrome",
    "Application",
    "chrome.exe"
  ),
];

/*
 * ----------------------------------------
 * FIND CHROME
 * ----------------------------------------
 */

function findChromeExecutable() {
  for (const chromePath of CHROME_PATHS) {
    if (fs.existsSync(chromePath)) {
      return chromePath;
    }
  }

  throw new Error(
    "Google Chrome was not found.\n" +
      "Please make sure Google Chrome is installed."
  );
}

/*
 * ----------------------------------------
 * READ ORIGINAL CHROME PROFILES
 * ----------------------------------------
 */

function getChromeUserDataDir() {
  return path.join(
    process.env.LOCALAPPDATA || "",
    "Google",
    "Chrome",
    "User Data"
  );
}

function loadChromeProfiles() {
  const userDataDir =
    getChromeUserDataDir();

  const localStatePath =
    path.join(
      userDataDir,
      "Local State"
    );

  if (
    !fs.existsSync(localStatePath)
  ) {
    throw new Error(
      `Chrome Local State file was not found:\n${localStatePath}`
    );
  }

  let localState;

  try {
    localState = JSON.parse(
      fs.readFileSync(
        localStatePath,
        "utf8"
      )
    );
  } catch (error) {
    throw new Error(
      `Could not read Chrome Local State: ${error.message}`
    );
  }

  const infoCache =
    localState?.profile?.info_cache || {};

  const profiles = Object.entries(
    infoCache
  )
    .map(
      ([directory, profile]) => ({
        directory,

        name:
          profile?.name ||
          directory,

        email:
          profile?.user_name ||
          "",
      })
    )
    .filter((profile) => {
      const profilePath =
        path.join(
          userDataDir,
          profile.directory
        );

      return fs.existsSync(
        profilePath
      );
    })
    .sort((a, b) => {
      if (a.directory === "Default") {
        return -1;
      }

      if (b.directory === "Default") {
        return 1;
      }

      return a.name.localeCompare(
        b.name
      );
    });

  return profiles;
}

/*
 * ----------------------------------------
 * ASK USER
 * ----------------------------------------
 */

function askQuestion(question) {
  const rl =
    readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

  return new Promise(
    (resolve) => {
      rl.question(
        question,
        (answer) => {
          rl.close();
          resolve(
            answer.trim()
          );
        }
      );
    }
  );
}

/*
 * ----------------------------------------
 * SELECT PROFILE
 * ----------------------------------------
 */

async function selectChromeProfile() {
  const profiles =
    loadChromeProfiles();

  if (!profiles.length) {
    throw new Error(
      "No Chrome profiles were found."
    );
  }

  console.log("");
  console.log(
    "========================================"
  );
  console.log(
    "       CHROME PROFILE SELECTION"
  );
  console.log(
    "========================================"
  );
  console.log("");

  profiles.forEach(
    (profile, index) => {
      console.log(
        `${index + 1}. ${profile.name} (${profile.directory})` +
          (profile.email
            ? ` - ${profile.email}`
            : "")
      );
    }
  );

  console.log("");

  while (true) {
    const answer =
      await askQuestion(
        `Select Chrome profile [1-${profiles.length}]: `
      );

    const selectedIndex =
      Number(answer) - 1;

    if (
      Number.isInteger(
        selectedIndex
      ) &&
      selectedIndex >= 0 &&
      selectedIndex <
        profiles.length
    ) {
      const selected =
        profiles[selectedIndex];

      console.log("");

      logSuccess(
        `Selected profile: ${selected.name}`
      );

      logInfo(
        `Original Chrome profile: ${selected.directory}`
      );

      return selected;
    }

    logWarning(
      `Please enter a number between 1 and ${profiles.length}.`
    );
  }
}

/*
 * ----------------------------------------
 * SESSION DIRECTORY
 * ----------------------------------------
 */

function createSafeSessionName(
  profile
) {
  return profile.directory
    .replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );
}

function getSessionDirectory(
  profile
) {
  const sessionName =
    createSafeSessionName(
      profile
    );

  return path.join(
    CHROME_SESSIONS_DIR,
    sessionName
  );
}

/*
 * ----------------------------------------
 * FACEBOOK LOGIN DETECTION
 * ----------------------------------------
 */

async function isFacebookLoginPage(
  page
) {
  try {
    const currentUrl =
      page.url();

    if (
      currentUrl.includes(
        "/login"
      )
    ) {
      return true;
    }

    const emailInput =
      await page
        .locator(
          'input[name="email"]'
        )
        .count();

    const passwordInput =
      await page
        .locator(
          'input[name="pass"]'
        )
        .count();

    if (
      emailInput > 0 &&
      passwordInput > 0
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/*
 * ----------------------------------------
 * WAIT FOR MANUAL FACEBOOK LOGIN
 * ----------------------------------------
 */

async function waitForFacebookLogin(
  page
) {
  console.log("");
  console.log(
    "========================================"
  );
  console.log(
    "          FACEBOOK LOGIN"
  );
  console.log(
    "========================================"
  );
  console.log("");

  console.log(
    "This Chrome session does not have a"
  );

  console.log(
    "Facebook login yet."
  );

  console.log("");

  console.log(
    "Please log in to Facebook manually"
  );

  console.log(
    "inside the Chrome window."
  );

  console.log("");

  console.log(
    "After you are successfully logged in,"
  );

  console.log(
    "return to this terminal."
  );

  console.log("");

  await askQuestion(
    "Press ENTER after Facebook login is complete: "
  );

  await page.waitForTimeout(
    3000
  );

  const stillLoginPage =
    await isFacebookLoginPage(
      page
    );

  if (stillLoginPage) {
    throw new Error(
      "Facebook still appears to be on the login page. " +
        "Please make sure you completed the login and try again."
    );
  }

  logSuccess(
    "Facebook login detected."
  );

  logInfo(
    "The Facebook session will be saved for future runs."
  );
}

/*
 * ----------------------------------------
 * CREATE BROWSER
 * ----------------------------------------
 */

async function createFacebookPage(
  pageUrl
) {
  const profile =
    await selectChromeProfile();

  const chromePath =
    findChromeExecutable();

  const sessionDirectory =
    getSessionDirectory(
      profile
    );

  await fs.promises.mkdir(
    sessionDirectory,
    {
      recursive: true,
    }
  );

  const isNewSession =
    !fs.existsSync(
      path.join(
        sessionDirectory,
        "Default"
      )
    ) &&
    !fs.existsSync(
      path.join(
        sessionDirectory,
        "Local State"
      )
    );

  console.log("");

  logInfo(
    `Chrome executable: ${chromePath}`
  );

  logInfo(
    `Automation session: ${sessionDirectory}`
  );

  if (isNewSession) {
    logInfo(
      "This is a new automation session."
    );
  } else {
    logInfo(
      "Existing automation session found."
    );
  }

  console.log("");

  const context =
    await chromium.launchPersistentContext(
      sessionDirectory,
      {
        executablePath:
          chromePath,

        headless:
          config.BROWSER.HEADLESS,

        viewport: null,

        timeout:
          config.BROWSER.TIMEOUT,

        acceptDownloads: true,

        args: [
          "--start-maximized",
        ],
      }
    );

  logSuccess(
    "Automation Chrome started."
  );

  const page =
    await context.newPage();

  page.setDefaultTimeout(
    config.BROWSER.TIMEOUT
  );

  logInfo(
    "Opening Facebook in a new tab..."
  );

  logInfo(
    `URL: ${pageUrl}`
  );

  await page.goto(
    pageUrl,
    {
      waitUntil:
        "domcontentloaded",

      timeout:
        config.BROWSER.TIMEOUT,
    }
  );

  await page.waitForTimeout(
    5000
  );

  const loginRequired =
    await isFacebookLoginPage(
      page
    );

  if (loginRequired) {
    await waitForFacebookLogin(
      page
    );

    logInfo(
      "Reloading Facebook page..."
    );

    await page.goto(
      pageUrl,
      {
        waitUntil:
          "domcontentloaded",

        timeout:
          config.BROWSER.TIMEOUT,
      }
    );

    await page.waitForTimeout(
      5000
    );
  }

  logSuccess(
    "Facebook page opened successfully."
  );

  return {
    browser: context,
    context,
    page,
    profile,
    sessionDirectory,
  };
}

module.exports = {
  createFacebookPage,
};