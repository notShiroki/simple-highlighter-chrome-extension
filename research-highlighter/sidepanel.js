let currentMode = "CURRENT_TAB";
let currentTabId = null;
let currentTabUrl = "";

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    currentTabId = tab.id;
    currentTabUrl = tab.url;
    render();
  }
}

document.getElementById("toggle-mode").addEventListener("click", (e) => {
  currentMode = currentMode === "CURRENT_TAB" ? "ALL_TABS" : "CURRENT_TAB";
  e.target.textContent =
    currentMode === "CURRENT_TAB" ? "Show All" : "Show Current";
  document.getElementById("mode-title").textContent =
    currentMode === "CURRENT_TAB" ? "Current Tab" : "All Highlights";
  render();
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  currentTabId = tab.id;
  currentTabUrl = tab.url;
  if (currentMode === "CURRENT_TAB") render();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === currentTabId && changeInfo.status === "complete") {
    currentTabUrl = tab.url;
    render();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.highlights) render();
});

function render() {
  chrome.storage.local.get({ highlights: [] }, (result) => {
    const list = document.getElementById("list");
    list.innerHTML = "";
    const allHighlights = result.highlights;

    if (currentMode === "CURRENT_TAB") {
      const items = allHighlights.filter((h) => h.url === currentTabUrl);
      renderGroup(list, "Current Page", items, false);
    } else {
      const grouped = groupBy(allHighlights, "url");
      if (Object.keys(grouped).length === 0) {
        list.innerHTML = "<div class='empty'>No saved highlights.</div>";
        return;
      }
      for (const [url, items] of Object.entries(grouped)) {
        renderGroup(list, url, items, true);
      }
    }
  });
}

function renderGroup(container, title, items, showHeader) {
  if (items.length === 0) {
    if (!showHeader)
      container.innerHTML =
        "<div class='empty'>No highlights on this page.</div>";
    return;
  }

  const groupDiv = document.createElement("div");
  groupDiv.className = "group";

  if (showHeader) {
    const header = document.createElement("div");
    header.className = "group-title";
    try {
      header.textContent = new URL(title).hostname;
    } catch (e) {
      header.textContent = title.substring(0, 40) + "...";
    }
    header.onclick = () => chrome.tabs.create({ url: title });
    groupDiv.appendChild(header);
  }

  items.forEach((h) => {
    const itemDiv = document.createElement("div");
    itemDiv.className = "item";

    // Text container (clickable to scroll)
    const textSpan = document.createElement("div");
    textSpan.className = "item-text";
    textSpan.textContent = h.text;
    textSpan.onclick = () => handleItemClick(h);

    // Delete Button (X)
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.innerHTML = "&times;"; // Standard HTML entity for multiplication sign (X)
    deleteBtn.title = "Remove Highlight";
    deleteBtn.onclick = (e) => {
      e.stopPropagation(); // Prevent triggering the scroll click
      deleteHighlight(h.id);
    };

    itemDiv.appendChild(textSpan);
    itemDiv.appendChild(deleteBtn);
    groupDiv.appendChild(itemDiv);
  });

  container.appendChild(groupDiv);
}

function handleItemClick(h) {
  if (h.url === currentTabUrl) {
    sendScrollMessage(h.id);
  } else {
    chrome.tabs.create({ url: h.url, active: true }, (tab) => {
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, {
          action: "SCROLL_TO_HIGHLIGHT",
          id: h.id,
        });
      }, 1000);
    });
  }
}

function deleteHighlight(id) {
  chrome.storage.local.get({ highlights: [] }, (result) => {
    const updatedHighlights = result.highlights.filter((h) => h.id !== id);
    chrome.storage.local.set({ highlights: updatedHighlights }, () => {
      // Logic to remove the visual highlight from the current page if it's open
      if (currentTabId) {
        chrome.tabs
          .sendMessage(currentTabId, {
            action: "REMOVE_HIGHLIGHT",
            id: id,
          })
          .catch(() => {});
      }
    });
  });
}

function sendScrollMessage(highlightId) {
  if (currentTabId) {
    chrome.tabs
      .sendMessage(currentTabId, {
        action: "SCROLL_TO_HIGHLIGHT",
        id: highlightId,
      })
      .catch((e) => {});
  }
}

function groupBy(array, key) {
  return array.reduce((result, currentValue) => {
    (result[currentValue[key]] = result[currentValue[key]] || []).push(
      currentValue
    );
    return result;
  }, {});
}

init();
