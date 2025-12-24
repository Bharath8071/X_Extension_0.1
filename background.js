// Focus Overlay - Background Service Worker
// Minimal helper for storage operations (if needed)
// Note: Content script can access chrome.storage directly,
// so this file is kept minimal for potential future use

chrome.runtime.onInstalled.addListener(() => {
  console.log('Focus Overlay extension installed');
});

// Optional: Clean up old unlock entries periodically
// This is not required for functionality but can help with storage management
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    // Log changes for debugging (optional)
    // console.log('Storage changed:', changes);
  }
});

