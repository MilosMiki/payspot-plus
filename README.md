# PaySpot QR camera test

Temporary desktop Chrome extension for reading QR code data from a webcam.

Before loading the extension, run `npm install` from this folder. The QR decoder is bundled locally because Chrome does not expose its optional `BarcodeDetector` API in every desktop build.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this `payspot-plus` folder.
4. Click the extension icon. The launcher contains only **Skeniraj** and **Šabloni**.
5. Click **Skeniraj** to open the full-screen scanner window.
6. Allow camera access when Chrome asks. If access is blocked, open `chrome://settings/content/camera`, remove the block, reload the extension, and try again.

Reload the payment page after reloading the extension so its content script is installed. The camera scans continuously until it detects a QR code or you click **Stop**; there is no scan timeout. The transformed payment JSON fills only non-null fields in the active page. For a local `file://` test page, enable **Allow access to file URLs** on the extension details page.

The decoded value appears in the scanner bubble and is also written to its DevTools console. Keep the bubble open while scanning. The camera list can be refreshed after permission is granted. The extension uses the locally bundled `jsQR` decoder and does not send camera frames or QR data anywhere.
