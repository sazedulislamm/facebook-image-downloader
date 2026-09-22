 # Facebook Image Downloader

Node.js command-line tool that uses a visible Google Chrome session and Playwright to discover publicly accessible images in Facebook profile, page, and group galleries.

For each discovered photo, the application opens the individual Facebook photo page when possible, selects an accessible image candidate, downloads it, converts it to exactly `224 x 224`, removes metadata, checks for duplicates, and stores unique results in `downloads/`.

## Requirements

- Windows
- Node.js and npm
- Google Chrome installed in one of the standard Windows locations:
	- `%PROGRAMFILES%\Google\Chrome\Application\chrome.exe`
	- `%PROGRAMFILES(X86)%\Google\Chrome\Application\chrome.exe`
	- `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`
- At least one Chrome profile. The application reads Chrome's profile list from `%LOCALAPPDATA%\Google\Chrome\User Data\Local State`.
- An interactive terminal. The first run asks you to choose a Chrome profile and may pause for manual Facebook login.

The application launches the installed Chrome browser. It does not use Playwright's bundled browser and does not accept cookies, tokens, or credentials through configuration files.

## Install

From the project directory:

```powershell
npm install
```

`npm install` installs Playwright and Sharp. No separate browser download is required, but Google Chrome must be installed.

## Usage

```powershell
npm start -- "https://www.facebook.com/USERNAME/photos"
```

The equivalent command is:

```powershell
npm run download -- "https://www.facebook.com/PAGE/photos"
```

The direct entrypoint is:

```powershell
node src/app.js "https://www.facebook.com/groups/GROUP/media"
```

Supported gallery path shapes are:

- `https://www.facebook.com/USERNAME/photos`
- `https://www.facebook.com/PAGE/photos`
- `https://www.facebook.com/groups/GROUP/media`

Path matching is case-insensitive. Query strings are allowed. The gallery must be accessible to the selected Facebook session; private, restricted, deleted, or unavailable photos may fail or be skipped.

## Browser session and login

At startup, the application:

1. Reads available profiles from the existing Chrome installation.
2. Prompts you to select a profile.
3. Creates or reuses a persistent automation session under `chrome-sessions/<profile-directory>`.
4. Opens a visible, maximized Chrome window.
5. Pauses for manual Facebook login if the page appears to be a login page.

The selected original profile is used to discover profile names. Automation runs in the separate `chrome-sessions` directory, so the normal Chrome profile is not directly opened by Playwright. Complete any Facebook login, checkpoint, or MFA interaction in the browser window, then press Enter in the terminal when prompted.

Keep the automation session directory between runs if you want its browser login state to persist. Do not run multiple copies of the downloader against the same session directory at the same time.

## Processing pipeline

```text
Gallery URL
	-> scroll and collect photo.php?fbid links
	-> open individual photo pages
	-> inspect img, srcset, Open Graph, and image_src candidates
	-> download the selected image
	-> resize to exactly 224 x 224 with Sharp
	-> remove metadata while writing the processed image
	-> calculate SHA-256 and visual bitmap hash
	-> delete duplicates or save the unique image
```

The crawler deduplicates discovered Facebook photo IDs, waits for lazy-loaded content, and stops after eight idle scans or 1,000 scroll scans. It uses two download workers. Individual image downloads retry up to three attempts, follow up to five redirects, and time out after 45 seconds.

The resolver ranks accessible image candidates using their dimensions and source type. It is best-effort: Facebook markup and access restrictions can prevent the largest available image from being found. If photo-page resolution fails, the worker falls back to the gallery thumbnail when one is available.

## Output

The application creates these directories as needed:

```text
data/
	images.json        # JSON database of accepted images
downloads/
	image-001.jpg     # processed unique images
logs/               # currently created but not written to
chrome-sessions/    # persistent Playwright Chrome sessions
```

Final files keep the downloaded JPEG, PNG, or WebP format and use names such as `image-001.jpg`. They are always written at `224 x 224`. The original downloaded file is temporary and is deleted after processing.

Each accepted `data/images.json` record contains the source and processing metadata, including `id`, `photoId`, `sourceUrl`, `photoUrl`, `pageUrl`, `fileName`, `filePath`, `hash`, `perceptualHash`, `width`, `height`, and `createdAt`.

Image numbers are assigned when images are discovered, before downloading. Failed and duplicate images therefore consume numbers and can leave gaps.

Messages are written to the terminal. Although `logs/` is created, this version does not write log files.

## Duplicate detection

Duplicate checks run after the image has been resized and processed:

- SHA-256 identifies exact byte-for-byte duplicates.
- A visual hash resizes the processed image to `32 x 32` grayscale, compares every pixel with the average brightness, and stores a 1,024-character bitmap string.
- A Hamming distance of `6` or less is treated as a visual duplicate.

This visual hash is an average-threshold bitmap hash, not a traditional DCT-based pHash. Duplicate files are deleted and counted in the final summary.

## Configuration

Runtime constants are in [`src/config/config.js`](src/config/config.js):

| Setting | Default | Purpose |
| --- | ---: | --- |
| `SCRAPER.MAX_SCROLLS` | `1000` | Maximum gallery scans |
| `SCRAPER.MAX_IDLE_SCROLLS` | `8` | Consecutive scans without new media before stopping |
| `SCRAPER.SCROLL_DELAY_MIN` | `2500` ms | Minimum post-scroll delay |
| `SCRAPER.SCROLL_DELAY_MAX` | `4500` ms | Maximum post-scroll delay |
| `SCRAPER.MIN_IMAGE_WIDTH` | `250` | Minimum fallback image width |
| `SCRAPER.MIN_IMAGE_HEIGHT` | `180` | Minimum fallback image height |
| `BROWSER.HEADLESS` | `false` | Browser mode; the current launcher is visible |
| `BROWSER.TIMEOUT` | `60000` ms | Playwright navigation/action timeout |
| `DOWNLOAD.TIMEOUT` | `45000` ms | Individual HTTP request timeout |
| `DOWNLOAD.MAX_REDIRECTS` | `5` | Redirect limit per image |
| `DOWNLOAD.RETRIES` | `3` | Total download attempts |
| `DUPLICATE.PHASH_THRESHOLD` | `6` | Maximum visual-hash distance |

The worker count is currently fixed at `2` in `src/app.js`. There is no `.env` file or command-line option for overriding these values.

## Gallery diagnostic

When Facebook changes its markup or discovery is unexpectedly low, run the diagnostic tool:

```powershell
node src/debugGallery.js "https://www.facebook.com/USERNAME/photos"
```

It opens the same browser/session flow, performs five scrolls, and prints image elements, gallery links, large role-based elements, document height, and the current page URL. It does not download images.

## Project structure

```text
src/
	app.js                         CLI orchestration
	debugGallery.js                gallery inspection tool
	browser/facebookBrowser.js    Chrome profile and session handling
	scraper/                       gallery crawling and photo resolution
	downloader/                    HTTP image downloads and retries
	processor/                     Sharp resize and metadata removal
	duplicate/                    duplicate helpers
	queue/                         producer queue and download workers
	storage/                       JSON database and filesystem helpers
	utils/                         filenames, hashes, and console logging
```

`index.js` is empty; use `src/app.js` through the npm scripts above.

## Limitations and troubleshooting

- Facebook's DOM, URLs, permissions, and image CDN behavior can change without notice.
- The initial gallery validator accepts any URL whose path ends in `/photos` or matches `/groups/.../media`; use a real `www.facebook.com` URL because photo extraction requires Facebook hosts.
- Downloader responses may advertise GIF, BMP, TIFF, or AVIF, but the processing pipeline only accepts JPEG, PNG, and WebP. Such items are reported as failed.
- The `224 x 224` resize uses `fit: "fill"`, so the source aspect ratio is intentionally not preserved.
- The JSON database is written synchronously by two workers. Concurrent saves can overwrite another worker's latest record in busy runs.
- Ctrl+C does not provide coordinated queue draining; stop the process only when you accept that in-progress temporary files or browser sessions may need cleanup.
- To retry a failed run, keep `data/images.json`, `downloads/`, and the Chrome session. The downloader resumes numbering from the highest existing `image-NNN.*` filename.

## License

No license file is currently included in this repository.
