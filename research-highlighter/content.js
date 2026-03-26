// content.js

// 1. Initialize Registries for Realistic Ink Effect
const registryLight = new Highlight();
const registryMedium = new Highlight();
const registryHeavy = new Highlight();

CSS.highlights.set("highlight-light", registryLight);
CSS.highlights.set("highlight-medium", registryMedium);
CSS.highlights.set("highlight-heavy", registryHeavy);

// Map to store master ranges for scrolling and deletion lookup
const rangeMap = new Map();

// --- Event Listeners ---
window.addEventListener("load", loadHighlights);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "HIGHLIGHT") {
    const success = applyAndSaveHighlight();
    sendResponse({ success });
  } else if (request.action === "SCROLL_TO_HIGHLIGHT") {
    scrollToText(request.id);
    sendResponse({ success: true });
  } else if (request.action === "REMOVE_HIGHLIGHT") {
    removeHighlightById(request.id);
    sendResponse({ success: true });
  }
});

// --- Dynamic Content Handler ---
// Debounced observer to handle React/SPA updates
let timeoutId = null;
const observer = new MutationObserver(() => {
  if (timeoutId) clearTimeout(timeoutId);
  timeoutId = setTimeout(() => {
    requestIdleCallback(loadHighlights);
  }, 1000);
});
observer.observe(document.body, { childList: true, subtree: true });

// --- Core Functions ---

function applyAndSaveHighlight() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;

  const range = selection.getRangeAt(0);
  const text = range.toString().trim();
  if (!text) return false;

  // Generate ID
  const id = crypto.randomUUID();

  // 1. Apply Visuals (Granular Ink Effect)
  applyRealisticHighlight(range);

  // 2. Store Master Range in Memory (for scrolling/logic)
  rangeMap.set(id, range);
  selection.removeAllRanges();

  // 3. Save to Storage
  const highlightData = {
    id: id,
    url: window.location.href,
    text: text,
    startPath: getXPathTo(range.startContainer),
    startOffset: range.startOffset,
    endPath: getXPathTo(range.endContainer),
    endOffset: range.endOffset,
    timestamp: Date.now(),
  };

  saveHighlight(highlightData);
  return true;
}

function applyRealisticHighlight(masterRange) {
  // Walks text nodes within the range to apply varying "ink pressure"
  const iterator = document.createNodeIterator(
    masterRange.commonAncestorContainer,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        return masterRange.intersectsNode(node)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    }
  );

  let currentNode;
  while ((currentNode = iterator.nextNode())) {
    // Determine the start/end offsets for this specific text node
    const start =
      currentNode === masterRange.startContainer ? masterRange.startOffset : 0;
    const end =
      currentNode === masterRange.endContainer
        ? masterRange.endOffset
        : currentNode.length;

    if (end <= start) continue;

    // Split into random chunks to simulate hand speed/pressure
    let cursor = start;
    while (cursor < end) {
      // Random chunk length (5 to 20 chars)
      const chunkLen = Math.floor(Math.random() * 15) + 5;
      const chunkEnd = Math.min(cursor + chunkLen, end);

      const subRange = document.createRange();
      subRange.setStart(currentNode, cursor);
      subRange.setEnd(currentNode, chunkEnd);

      // Randomize Pressure
      // Heavy (Wet) = 15%, Medium (Normal) = 55%, Light (Fast) = 30%
      const pressure = Math.random();
      if (pressure > 0.85) {
        registryHeavy.add(subRange);
      } else if (pressure > 0.3) {
        registryMedium.add(subRange);
      } else {
        registryLight.add(subRange);
      }

      cursor = chunkEnd;
    }
  }
}

function saveHighlight(data) {
  chrome.storage.local.get({ highlights: [] }, (result) => {
    const highlights = [...result.highlights, data];
    chrome.storage.local.set({ highlights }, () => {
      const count = highlights.filter(
        (h) => h.url === window.location.href
      ).length;
      updateBadge(count);
    });
  });
}

function loadHighlights() {
  // Clear everything first to prevent ghosts/duplicates
  registryLight.clear();
  registryMedium.clear();
  registryHeavy.clear();
  rangeMap.clear();

  chrome.storage.local.get({ highlights: [] }, (result) => {
    const pageHighlights = result.highlights.filter(
      (h) => h.url === window.location.href
    );
    updateBadge(pageHighlights.length);

    pageHighlights.forEach((h) => {
      try {
        const range = restoreRange(h);
        if (range) {
          // Apply visual effect
          applyRealisticHighlight(range);
          // Store master range
          rangeMap.set(h.id, range);
        }
      } catch (e) {
        // Node might not exist yet (dynamic content)
      }
    });
  });
}

function scrollToText(highlightId) {
  const range = rangeMap.get(highlightId);
  if (range) {
    const element = range.startContainer.parentElement;
    element.scrollIntoView({ behavior: "smooth", block: "center" });

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    setTimeout(() => selection.removeAllRanges(), 1500);
  }
}

function removeHighlightById(id) {
  rangeMap.delete(id);

  // Reload: This will read from storage
  // and re-paint only the remaining highlights.
  loadHighlights();
}

// --- Helpers ---

function getXPathTo(element) {
  if (element.id !== "") return 'id("' + element.id + '")';
  if (element === document.body) return element.tagName;
  let ix = 0;
  const siblings = element.parentNode ? element.parentNode.childNodes : [];
  for (let i = 0; i < siblings.length; i++) {
    const sibling = siblings[i];
    if (sibling === element)
      return (
        getXPathTo(element.parentNode) +
        "/" +
        element.tagName +
        "[" +
        (ix + 1) +
        "]"
      );
    if (sibling.nodeType === 1 && sibling.tagName === element.tagName) ix++;
  }
}

function restoreRange(h) {
  const startNode = document.evaluate(
    h.startPath,
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null
  ).singleNodeValue;
  const endNode = document.evaluate(
    h.endPath,
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null
  ).singleNodeValue;
  if (!startNode || !endNode) return null;

  const range = document.createRange();
  range.setStart(startNode, h.startOffset);
  range.setEnd(endNode, h.endOffset);
  return range;
}

function updateBadge(count) {
  chrome.runtime
    .sendMessage({ action: "HIGHLIGHTS_UPDATED", count })
    .catch((e) => {});
}
