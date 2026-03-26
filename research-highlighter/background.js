// background.js

// 1. Installation & Menu Creation
chrome.runtime.onInstalled.addListener(() => {
  createContextMenus();
});

function createContextMenus() {
  chrome.contextMenus.create({
    id: "highlight-selection",
    title: "Highlight Selection",
    contexts: ["selection"],
  });

  chrome.contextMenus.create({
    id: "open-sidepanel",
    title: "View Research Highlights",
    contexts: ["page", "action"],
  });
}

// 2. Event Listeners
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "highlight-selection") {
    sendMessageToTab(tab.id, { action: "HIGHLIGHT" });
  } else if (info.menuItemId === "open-sidepanel") {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-highlight") {
    sendMessageToTab(tab.id, { action: "HIGHLIGHT" });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "HIGHLIGHTS_UPDATED" && sender.tab) {
    const count = request.count;
    const text = count > 0 ? count.toString() : "";
    chrome.action.setBadgeText({ text: text, tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({
      color: "#EAB308",
      tabId: sender.tab.id,
    });
  }
});

// 3. Side Panel Behavior
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// 4. Helper Function
function sendMessageToTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, message).catch((error) => {
    console.warn(
      "Could not send message. Tab might be protected or not ready.",
      error
    );
  });
}
