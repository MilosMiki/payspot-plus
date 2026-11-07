document.querySelector("#scan-button").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.id) {
    return;
  }

  await chrome.runtime.sendMessage({
    type: "openScanner",
    tabId: tab.id,
    bounds: {
      width: window.screen.availWidth,
      height: window.screen.availHeight,
      left: window.screen.availLeft || 0,
      top: window.screen.availTop || 0,
    },
  });
  window.close();
});

document
  .querySelector("#templates-button")
  .addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    await chrome.runtime.sendMessage({
      type: "openTemplates",
      tabId: tab?.id,
      bounds: {
        width: window.screen.availWidth,
        height: window.screen.availHeight,
        left: window.screen.availLeft || 0,
        top: window.screen.availTop || 0,
      },
    });
    window.close();
  });
