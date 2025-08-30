// Clipo/background.js

// Default settings
let extensionSettings = {
  maxItems: 1000,
  autoCleanupDays: 0
};

console.log('Background script starting...');

// Initialize settings on startup
chrome.runtime.onStartup.addListener(() => {
  console.log('Extension startup');
  loadSettings();
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed/updated');
  loadSettings();
});

// Load settings from storage
function loadSettings() {
  chrome.storage.local.get(['extensionSettings'], (result) => {
    if (result.extensionSettings) {
      extensionSettings = { ...extensionSettings, ...result.extensionSettings };
    } else {
      // Save default settings if none exist
      chrome.storage.local.set({ extensionSettings: extensionSettings });
    }
    console.log('Settings loaded:', extensionSettings);
  });
}

// Keep the side panel behavior
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Side panel error:', error));

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  console.log('Command received:', command);
  
  if (command === 'open-side-panel') {
    // Open the side panel for the current window
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.sidePanel.open({ windowId: tabs[0].windowId }, () => {
          if (chrome.runtime.lastError) {
            console.error('Failed to open side panel:', chrome.runtime.lastError);
          } else {
            console.log('Side panel opened via keyboard shortcut');
          }
        });
      }
    });
  }
});

// Listen for messages from the content script and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type);
  
  if (message.type === 'saveClipboardItem') {
    const clipboardItem = message.payload;
    console.log('Saving clipboard item:', clipboardItem.text.substring(0, 50) + '...');

    chrome.storage.local.get(['clipboardHistory'], (result) => {
      let history = result.clipboardHistory || [];
      
      // Check for duplicates - don't add if same text exists recently
      const isDuplicate = history.some(item => 
        item.text === clipboardItem.text && 
        (Date.now() - item.createdAt) < 3000 // Within 3 seconds
      );
      
      if (!isDuplicate) {
        history.unshift(clipboardItem);
        console.log('Added new item to history. Total items:', history.length);

        // Use settings-based limit
        const limit = extensionSettings.maxItems;
        
        if (history.length > limit) {
          const pinnedItems = history.filter(item => item.pinned);
          let unpinnedItems = history.filter(item => !item.pinned);
          
          const maxUnpinned = Math.max(0, limit - pinnedItems.length);
          const trimmedUnpinned = unpinnedItems.slice(0, maxUnpinned);

          history = [...pinnedItems, ...trimmedUnpinned];
          console.log('Trimmed history to limit. New count:', history.length);
        }

        // Apply auto-cleanup if enabled
        if (extensionSettings.autoCleanupDays > 0) {
          const cutoffTime = Date.now() - (extensionSettings.autoCleanupDays * 24 * 60 * 60 * 1000);
          const originalLength = history.length;
          history = history.filter(item => 
            item.pinned || item.createdAt > cutoffTime
          );
          if (history.length !== originalLength) {
            console.log('Auto-cleanup removed', originalLength - history.length, 'items');
          }
        }

        // Save the updated history
        chrome.storage.local.set({ clipboardHistory: history }, () => {
          console.log("Clipboard item saved successfully");
          // Notify side panel
          try {
            chrome.runtime.sendMessage({ type: 'historyUpdated' });
          } catch (error) {
            console.log('Could not notify side panel (might not be open):', error.message);
          }
          sendResponse({ success: true });
        });
      } else {
        console.log('Duplicate item ignored');
        sendResponse({ success: false, reason: 'duplicate' });
      }
    });
    
    return true; // Keep message channel open for async response
  }
  
  // Handle settings updates from the side panel
  if (message.type === 'settingsUpdated') {
    extensionSettings = { ...extensionSettings, ...message.settings };
    console.log('Settings updated:', extensionSettings);
    
    // Apply new settings to existing history
    applySettingsToHistory();
    
    sendResponse({ success: true });
    return true;
  }
});

// Apply current settings to existing history
function applySettingsToHistory() {
  chrome.storage.local.get(['clipboardHistory'], (result) => {
    let history = result.clipboardHistory || [];
    let needsUpdate = false;
    
    // Apply item limit
    if (history.length > extensionSettings.maxItems) {
      const pinnedItems = history.filter(item => item.pinned);
      const unpinnedItems = history.filter(item => !item.pinned);
      
      const maxUnpinned = Math.max(0, extensionSettings.maxItems - pinnedItems.length);
      const trimmedUnpinned = unpinnedItems.slice(0, maxUnpinned);
      
      history = [...pinnedItems, ...trimmedUnpinned];
      needsUpdate = true;
      console.log('Applied new item limit. Items after trim:', history.length);
    }
    
    // Apply auto-cleanup if enabled
    if (extensionSettings.autoCleanupDays > 0) {
      const cutoffTime = Date.now() - (extensionSettings.autoCleanupDays * 24 * 60 * 60 * 1000);
      const originalLength = history.length;
      
      history = history.filter(item => 
        item.pinned || item.createdAt > cutoffTime
      );
      
      if (history.length !== originalLength) {
        needsUpdate = true;
        console.log(`Auto-cleanup removed ${originalLength - history.length} items`);
      }
    }
    
    // Save updated history if changes were made
    if (needsUpdate) {
      chrome.storage.local.set({ clipboardHistory: history }, () => {
        try {
          chrome.runtime.sendMessage({ type: 'historyUpdated' });
        } catch (error) {
          console.log('Could not notify side panel (might not be open):', error.message);
        }
      });
    }
  });
}

console.log('Background script loaded successfully');