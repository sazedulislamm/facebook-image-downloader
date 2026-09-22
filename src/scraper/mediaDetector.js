function isFacebookUiAsset(url) {
  if (!url) {
    return true;
  }

  const lowerUrl = String(url).toLowerCase();

  /*
   * Facebook UI / tracking / placeholder assets.
   */

  const blockedPatterns = [
    "facebook.com/rsrc.php",
    "facebook.com/images/",
    "static.xx.fbcdn.net/rsrc.php",
    "static.xx.fbcdn.net/rsrc.php/",
    "lookaside.fbsbx.com",
    "emoji.php",
    "transparent.gif",
    "spacer.gif",
    "data:image/",
  ];

  for (const pattern of blockedPatterns) {
    if (lowerUrl.includes(pattern)) {
      return true;
    }
  }

  return false;
}

module.exports = {
  isFacebookUiAsset,
};