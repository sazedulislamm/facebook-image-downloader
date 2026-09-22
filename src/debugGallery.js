const {
  createFacebookPage,
} = require("./browser/facebookBrowser");

const {
  isSupportedGalleryUrl,
} = require("./scraper/facebookImageScraper");

async function main() {
  const pageUrl = process.argv[2];

  if (!pageUrl) {
    console.log(
      'Usage: node src/debugGallery.js "FACEBOOK_GALLERY_URL"'
    );
    process.exit(1);
  }

  if (
    !isSupportedGalleryUrl(pageUrl)
  ) {
    throw new Error(
      "Unsupported Facebook gallery URL."
    );
  }

  let browser = null;

  try {
    console.log("");
    console.log(
      "Starting Facebook gallery diagnostic..."
    );

    const result =
      await createFacebookPage(
        pageUrl
      );

    browser =
      result.browser;

    const page =
      result.page;

    await page.waitForTimeout(
      3000
    );

    /*
     * Scroll a little so lazy-loaded content
     * is present.
     */
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        window.scrollBy(
          0,
          window.innerHeight * 0.8
        );
      });

      await page.waitForTimeout(
        1500
      );
    }

    const diagnostic =
      await page.evaluate(() => {
        const images =
          Array.from(
            document.querySelectorAll(
              "img"
            )
          ).map(
            (img, index) => {
              const rect =
                img.getBoundingClientRect();

              return {
                index,

                src:
                  img.currentSrc ||
                  img.src ||
                  null,

                width:
                  img.naturalWidth ||
                  img.width ||
                  Math.round(
                    rect.width
                  ),

                height:
                  img.naturalHeight ||
                  img.height ||
                  Math.round(
                    rect.height
                  ),

                className:
                  img.className ||
                  "",

                alt:
                  img.alt ||
                  "",

                parentTag:
                  img.parentElement
                    ?.tagName ||
                  null,

                parentRole:
                  img.parentElement
                    ?.getAttribute(
                      "role"
                    ) ||
                  null,

                parentHref:
                  img.closest("a")
                    ?.href ||
                  null,
              };
            }
          );

        const links =
          Array.from(
            document.querySelectorAll(
              "a[href]"
            )
          )
            .map(
              (a, index) => ({
                index,

                href:
                  a.href,

                text:
                  (
                    a.innerText ||
                    ""
                  ).trim().slice(
                    0,
                    100
                  ),

                hasImage:
                  !!a.querySelector(
                    "img"
                  ),

                imageSrc:
                  a.querySelector(
                    "img"
                  )?.currentSrc ||
                  a.querySelector(
                    "img"
                  )?.src ||
                  null,

                width:
                  a.querySelector(
                    "img"
                  )?.naturalWidth ||
                  0,

                height:
                  a.querySelector(
                    "img"
                  )?.naturalHeight ||
                  0,
              })
            )
            .filter(
              (item) =>
                item.hasImage ||
                item.href
                  .toLowerCase()
                  .includes(
                    "photo"
                  )
            );

        const photoElements =
          Array.from(
            document.querySelectorAll(
              '[role="img"], [role="button"], [role="link"]'
            )
          )
            .map(
              (element, index) => {
                const rect =
                  element.getBoundingClientRect();

                return {
                  index,

                  tag:
                    element.tagName,

                  role:
                    element.getAttribute(
                      "role"
                    ),

                  ariaLabel:
                    element.getAttribute(
                      "aria-label"
                    ),

                  href:
                    element.getAttribute(
                      "href"
                    ),

                  width:
                    Math.round(
                      rect.width
                    ),

                  height:
                    Math.round(
                      rect.height
                    ),

                  background:
                    window
                      .getComputedStyle(
                        element
                      )
                      .backgroundImage,

                  html:
                    element.outerHTML
                      .slice(
                        0,
                        1500
                      ),
                };
              }
            )
            .filter(
              (item) =>
                item.width >= 150 &&
                item.height >= 100
            );

        return {
          url:
            location.href,

          title:
            document.title,

          documentHeight:
            Math.max(
              document.body
                ?.scrollHeight ||
                0,
              document.documentElement
                ?.scrollHeight ||
                0
            ),

          imageCount:
            images.length,

          images,

          galleryLinks:
            links,

          largeRoleElements:
            photoElements,
        };
      });

    console.log("");
    console.log(
      "========================================"
    );
    console.log(
      " GALLERY DIAGNOSTIC"
    );
    console.log(
      "========================================"
    );

    console.log("");
    console.log(
      `URL: ${diagnostic.url}`
    );

    console.log(
      `Document height: ${diagnostic.documentHeight}px`
    );

    console.log(
      `IMG elements: ${diagnostic.imageCount}`
    );

    console.log("");
    console.log(
      "========== IMAGES =========="
    );

    for (
      const image of
        diagnostic.images
    ) {
      console.log("");
      console.log(
        `IMG #${image.index}`
      );
      console.log(
        `  Size: ${image.width}x${image.height}`
      );
      console.log(
        `  Alt: ${image.alt}`
      );
      console.log(
        `  Src: ${image.src}`
      );
      console.log(
        `  Parent: ${image.parentTag}`
      );
      console.log(
        `  Parent role: ${image.parentRole}`
      );
      console.log(
        `  Closest link: ${image.parentHref}`
      );
    }

    console.log("");
    console.log(
      "========== GALLERY LINKS =========="
    );

    for (
      const link of
        diagnostic.galleryLinks
    ) {
      console.log("");
      console.log(
        `LINK #${link.index}`
      );
      console.log(
        `  Href: ${link.href}`
      );
      console.log(
        `  Text: ${link.text}`
      );
      console.log(
        `  Has image: ${link.hasImage}`
      );
      console.log(
        `  Image size: ${link.width}x${link.height}`
      );
      console.log(
        `  Image src: ${link.imageSrc}`
      );
    }

    console.log("");
    console.log(
      "========== LARGE ROLE ELEMENTS =========="
    );

    for (
      const element of
        diagnostic.largeRoleElements
    ) {
      console.log("");
      console.log(
        `ELEMENT #${element.index}`
      );
      console.log(
        `  Tag: ${element.tag}`
      );
      console.log(
        `  Role: ${element.role}`
      );
      console.log(
        `  Size: ${element.width}x${element.height}`
      );
      console.log(
        `  Aria: ${element.ariaLabel}`
      );
      console.log(
        `  Href: ${element.href}`
      );
      console.log(
        `  Background: ${element.background}`
      );
      console.log(
        `  HTML: ${element.html}`
      );
    }

    console.log("");
    console.log(
      "Diagnostic finished."
    );

    /*
     * Keep browser open for 5 seconds
     * so you can visually inspect the page.
     */
    await page.waitForTimeout(
      5000
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main().catch((error) => {
  console.error("");
  console.error(
    "[ERROR]",
    error.message
  );

  process.exitCode = 1;
});