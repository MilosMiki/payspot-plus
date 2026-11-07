const toolWindowIds = {
  scanner: undefined,
  templates: undefined,
};
let creatingCameraDocument;

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "openScanner") {
    openScanner(message);
  }
  if (message.type === "openTemplates") {
    openToolWindow("templates", message.bounds, message.tabId);
  }
});

async function ensureCameraDocument() {
  if (creatingCameraDocument) {
    return creatingCameraDocument;
  }

  creatingCameraDocument = (async () => {
    const cameraUrl = chrome.runtime.getURL("camera.html");
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [cameraUrl],
    });

    if (contexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: "camera.html",
        reasons: ["USER_MEDIA"],
        justification: "Keep the approved webcam stream ready for QR scanning.",
      });
    }
  })().finally(() => {
    creatingCameraDocument = undefined;
  });

  return creatingCameraDocument;
}

async function openScanner(message) {
  try {
    await ensureCameraDocument();
  } catch (error) {
    console.error("Persistent camera could not start", error);
  }
  await openToolWindow("scanner", message.bounds, message.tabId);
}

async function openToolWindow(tool, bounds, tabId) {
  if (toolWindowIds[tool]) {
    try {
      await chrome.windows.update(toolWindowIds[tool], { focused: true });
      return;
    } catch {
      toolWindowIds[tool] = undefined;
    }
  }

  const query = tabId ? `?targetTabId=${encodeURIComponent(tabId)}` : "";
  const width = Math.round(bounds.width * 0.7);
  const height = Math.round(bounds.height * 0.7);
  const window = await chrome.windows.create({
    url: `${chrome.runtime.getURL(tool === "scanner" ? "popup.html" : "templates.html")}${query}`,
    type: "popup",
    focused: true,
    width,
    height,
    left: bounds.left + Math.round((bounds.width - width) / 2),
    top: bounds.top + Math.round((bounds.height - height) / 2),
  });
  toolWindowIds[tool] = window.id;
}

chrome.windows.onRemoved.addListener((windowId) => {
  Object.keys(toolWindowIds).forEach((tool) => {
    if (windowId === toolWindowIds[tool]) {
      toolWindowIds[tool] = undefined;
    }
  });
});
