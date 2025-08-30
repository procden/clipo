// Clipo/sidepanel.js
let clipboardHistory = [];
let settings = {
  maxItems: 1000,
  autoCleanupDays: 0,
  darkMode: false
};

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadClipboardHistory();
  
  document.getElementById('clearBtn').addEventListener('click', clearHistory);
  document.getElementById('searchBox').addEventListener('input', filterHistory);
  document.getElementById('addBtn').addEventListener('click', saveSearchAsItem);
  
  // Settings modal controls
  document.getElementById('settingsIcon').addEventListener('click', openSettings);
  document.getElementById('closeSettingsModal').addEventListener('click', closeSettings);
  document.getElementById('cancelSettings').addEventListener('click', closeSettings);
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  
  // Shortcuts configuration button
  document.getElementById('shortcutsLink').addEventListener('click', openShortcutsPage);
  
  // Dark mode toggle handler
  document.getElementById('darkModeSetting').addEventListener('change', (event) => {
    updateThemeLabel();
  });
  
  document.getElementById('searchBox').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveSearchAsItem();
    }
  });

  // QR Modal controls
  const qrModal = document.getElementById('qrModal');
  document.getElementById('closeQrModal').onclick = () => { qrModal.style.display = "none"; };
  
  // Settings Modal controls
  const settingsModal = document.getElementById('settingsModal');
  
  // Close modals when clicking outside
  window.onclick = (event) => {
    if (event.target == qrModal) {
      qrModal.style.display = "none";
    }
    if (event.target == settingsModal) {
      settingsModal.style.display = "none";
    }
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'historyUpdated') {
      loadClipboardHistory();
    }
  });
});

function openShortcutsPage() {
  // Open the Chrome extensions shortcuts page in a new tab
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
}

function loadSettings() {
  chrome.storage.local.get(['extensionSettings'], (result) => {
    if (result.extensionSettings) {
      settings = { ...settings, ...result.extensionSettings };
    }
    applySettingsToUI();
    applyTheme(); // Apply theme when loading settings
  });
}

function applySettingsToUI() {
  document.getElementById('maxItemsSetting').value = settings.maxItems;
  document.getElementById('autoCleanupSetting').value = settings.autoCleanupDays;
  document.getElementById('darkModeSetting').checked = settings.darkMode;
  updateThemeLabel();
}

function applyTheme() {
  if (settings.darkMode) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

function updateThemeLabel() {
  const themeLabel = document.getElementById('themeLabel');
  const isDarkMode = document.getElementById('darkModeSetting').checked;
  themeLabel.textContent = isDarkMode ? 'Dark Mode' : 'Light Mode';
}

function openSettings() {
  applySettingsToUI();
  document.getElementById('settingsModal').style.display = 'flex';
}

function closeSettings() {
  document.getElementById('settingsModal').style.display = 'none';
}

function saveSettings() {
  const maxItems = parseInt(document.getElementById('maxItemsSetting').value);
  const autoCleanupDays = parseInt(document.getElementById('autoCleanupSetting').value);
  const darkMode = document.getElementById('darkModeSetting').checked;
  
  // Validate settings
  if (maxItems < 10 || maxItems > 10000) {
    alert('Maximum items must be between 10 and 10,000');
    return;
  }
  
  if (autoCleanupDays < 0 || autoCleanupDays > 365) {
    alert('Auto-cleanup days must be between 0 and 365');
    return;
  }
  
  settings.maxItems = maxItems;
  settings.autoCleanupDays = autoCleanupDays;
  settings.darkMode = darkMode;
  
  // Save settings to storage
  chrome.storage.local.set({ extensionSettings: settings }, () => {
    console.log('Settings saved:', settings);
    
    // Apply theme immediately
    applyTheme();
    
    // Apply new limits to existing history
    applyNewLimits();
    
    // Notify background script about settings change
    chrome.runtime.sendMessage({ 
      type: 'settingsUpdated', 
      settings: settings 
    });
    
    closeSettings();
  });
}

function applyNewLimits() {
  if (clipboardHistory.length > settings.maxItems) {
    // Keep pinned items and trim unpinned ones
    const pinnedItems = clipboardHistory.filter(item => item.pinned);
    const unpinnedItems = clipboardHistory.filter(item => !item.pinned);
    
    const maxUnpinned = Math.max(0, settings.maxItems - pinnedItems.length);
    const trimmedUnpinned = unpinnedItems.slice(0, maxUnpinned);
    
    clipboardHistory = [...pinnedItems, ...trimmedUnpinned];
    
    chrome.storage.local.set({ clipboardHistory: clipboardHistory }, () => {
      displayHistory();
      updateItemCount();
    });
  }
  
  // Apply auto-cleanup if enabled
  if (settings.autoCleanupDays > 0) {
    performAutoCleanup();
  }
}

function performAutoCleanup() {
  const cutoffTime = Date.now() - (settings.autoCleanupDays * 24 * 60 * 60 * 1000);
  const originalLength = clipboardHistory.length;
  
  // Keep pinned items regardless of age, remove old unpinned items
  clipboardHistory = clipboardHistory.filter(item => 
    item.pinned || item.createdAt > cutoffTime
  );
  
  if (clipboardHistory.length !== originalLength) {
    chrome.storage.local.set({ clipboardHistory: clipboardHistory }, () => {
      console.log(`Auto-cleanup removed ${originalLength - clipboardHistory.length} items`);
      displayHistory();
      updateItemCount();
    });
  }
}

function loadClipboardHistory() {
  chrome.storage.local.get(['clipboardHistory'], (result) => {
    let history = result.clipboardHistory || [];
    let needsUpdate = false;

    history.forEach(item => {
      if (typeof item.createdAt !== 'number' && item.timestamp) {
        const parsedDate = new Date(item.timestamp).getTime();
        item.createdAt = isNaN(parsedDate) ? 0 : parsedDate;
        needsUpdate = true;
      }
    });

    if (needsUpdate) {
      chrome.storage.local.set({ clipboardHistory: history });
    }
    
    clipboardHistory = history;
    
    // Apply auto-cleanup on load if enabled
    if (settings.autoCleanupDays > 0) {
      performAutoCleanup();
    } else {
      displayHistory();
      updateItemCount();
    }
  });
}

function displayHistory(filteredHistory = null) {
  const listElement = document.getElementById('clipboardList');
  let history = filteredHistory || clipboardHistory;
  
  history.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  if (history.length === 0) {
    listElement.innerHTML = '<div class="empty-state">No clipboard history yet. Start copying text to see it here!</div>';
  } else {
    listElement.innerHTML = '';
    history.forEach((item) => {
      const itemElement = document.createElement('div');
      itemElement.className = 'clipboard-item';
      if (item.pinned) {
        itemElement.classList.add('pinned');
      }
      
      const contentContainer = document.createElement('div');
      contentContainer.className = 'item-content';
      
      const displayText = item.text.length > 200 ? item.text.substring(0, 200) + '...' : item.text;
      
      // Detect RTL and apply appropriate direction
      const isRTL = detectRTL(item.text);
      if (isRTL) {
        contentContainer.classList.add('rtl-content');
      }
      
      // Create the source link HTML
      const sourceHtml = createSourceLink(item.url);
      
      contentContainer.innerHTML = `
        <div class="clipboard-text">${escapeHtml(displayText)}</div>
        <div class="clipboard-meta">
          <span>${item.timestamp}</span>
          ${sourceHtml}
        </div>
      `;

      const actionsContainer = document.createElement('div');
      actionsContainer.className = 'item-actions';
      
      const qrIcon = document.createElement('img');
      qrIcon.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-qr-code" viewBox="0 0 16 16"><path d="M2 2h2v2H2V2Z"/><path d="M6 0v6H0V0h6ZM5 1H1v4h4V1ZM4 12H2v2h2v-2Z"/><path d="M6 10v6H0v-6h6Zm-5 1v4h4v-4H1Zm11-9h2v2h-2V2Z"/><path d="M10 0v6h6V0h-6Zm5 1v4h-4V1h4ZM8 1V0h1v2H8v2H7V1h1Zm0 5V4h1v2H8ZM6 8V7h1V6h1v2h1V7h5v1h-4v1H7V8H6Zm0 0v1H2V8H1v1H0V7h3v1h3Zm10 1h-1V7h1v2Zm-1 0h-1v2h2v-1h-1V9Zm-4 0h2v1h-1v1h-1V9Zm2 3v-1h-1v1h1Zm-1-4h1v1h-1V8Zm-2 3h1v1h-1v-1Z"/><path d="M7 12h1v3h1v1H7v-4Zm9 2v2h-1v-1h-1v1h-1v-2h1v1h1v-1h1Z"/></svg>';
      qrIcon.className = 'qr-icon';
      qrIcon.title = 'Show QR Code';
      qrIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        showQrCode(item.text);
      });

      const pinIcon = document.createElement('div');
      pinIcon.className = 'pin-icon';
      pinIcon.classList.add(item.pinned ? 'pinned' : 'unpinned');
      pinIcon.title = item.pinned ? 'Unpin item' : 'Pin item';
      pinIcon.addEventListener('click', (e) => { e.stopPropagation(); togglePin(item.createdAt); });

      const copyIcon = document.createElement('img');
      copyIcon.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-clipboard" viewBox="0 0 16 16"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg>';
      copyIcon.className = 'copy-icon';
      copyIcon.title = 'Copy to clipboard';
      copyIcon.addEventListener('click', (e) => { e.stopPropagation(); copyToClipboard(item.text, copyIcon); });
      
      const deleteIcon = document.createElement('img');
      deleteIcon.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash3" viewBox="0 0 16 16"><path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1h-.995a.59.59 0 0 0-.01 0H11Zm1.958 1-.846 10.58a1 1 0 0 1-.997.92h-6.23a1 1 0 0 1-.997-.92L3.042 3.5h9.916Zm-7.487 1a.5.5 0 0 1 .528.47l.5 8.5a.5.5 0 0 1-.998.06L5 5.03a.5.5 0 0 1 .47-.528ZM8 4.5a.5.5 0 0 1 .5.5v8.5a.5.5 0 0 1-1 0V5a.5.5 0 0 1 .5-.5Zm3 .5a.5.5 0 0 1 .47.528l-.5 8.5a.5.5 0 0 1-.998-.06l.5-8.5a.5.5 0 0 1 .528-.47Z"/></svg>';
      deleteIcon.className = 'delete-icon';
      deleteIcon.title = 'Delete item';
      deleteIcon.addEventListener('click', (e) => { e.stopPropagation(); deleteItem(item.createdAt); });

      actionsContainer.appendChild(qrIcon);
      actionsContainer.appendChild(pinIcon);
      actionsContainer.appendChild(copyIcon);
      actionsContainer.appendChild(deleteIcon);

      itemElement.appendChild(contentContainer);
      itemElement.appendChild(actionsContainer);
      listElement.appendChild(itemElement);
    });
  }
}

function createSourceLink(url) {
  if (url === 'manual') {
    return '<span>Manual</span>';
  }
  
  try {
    const hostname = new URL(url).hostname;
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="source-link" title="${escapeHtml(url)}">${escapeHtml(hostname)}</a>`;
  } catch {
    return '<span>Unknown</span>';
  }
}

function showQrCode(text) {
  const qrModal = document.getElementById('qrModal');
  const qrContainer = document.getElementById('qrcode');
  
  qrContainer.innerHTML = '';

  if (typeof QRCode === 'undefined') {
    qrContainer.innerHTML = "QR library failed to load. Please check your internet connection.";
    qrModal.style.display = "flex";
    return;
  }

  try {
    new QRCode(qrContainer, {
        text: text,
        width: 256,
        height: 256,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });

  } catch (error) {
    console.error("QR Code generation failed:", error);
    
    if (error.message.includes("code length overflow")) {
      qrContainer.innerHTML = "Failed , Text is too long or has Special characters.";
    } else {
      qrContainer.innerHTML = "Failed , Text is too long or has Special characters.";
    }
  }

  qrModal.style.display = "flex";
}

function saveSearchAsItem() {
  const searchBox = document.getElementById('searchBox');
  const text = searchBox.value.trim();
  
  if (text) {
    const now = new Date();
    const newItem = {
      text: text,
      timestamp: now.toLocaleString(),
      createdAt: now.getTime(),
      url: 'manual',
      title: 'Manual Entry',
      pinned: false,
      metaTags: ''
    };

    // Send to background script to apply limits consistently
    chrome.runtime.sendMessage({
      type: 'saveClipboardItem',
      payload: newItem
    }).then((response) => {
      console.log('Manual item saved:', response);
      searchBox.value = '';
      updateMatchCount(0);
      // History will be updated via the historyUpdated message
    }).catch(error => {
      console.error('Failed to save manual item:', error);
      // Fallback: save directly (without limits)
      clipboardHistory.unshift(newItem);
      chrome.storage.local.set({ clipboardHistory: clipboardHistory }, () => {
        searchBox.value = '';
        displayHistory();
        updateItemCount();
        updateMatchCount(0);
      });
    });
  }
}

function deleteItem(createdAt) {
  const itemIndex = clipboardHistory.findIndex(item => item.createdAt === createdAt);
  
  if (itemIndex > -1) {
    clipboardHistory.splice(itemIndex, 1);
    chrome.storage.local.set({ clipboardHistory: clipboardHistory }, () => {
      filterHistory();
      updateItemCount();
    });
  }
}

function togglePin(createdAt) {
  const itemIndex = clipboardHistory.findIndex(item => item.createdAt === createdAt);

  if (itemIndex > -1) {
    clipboardHistory[itemIndex].pinned = !clipboardHistory[itemIndex].pinned;
    chrome.storage.local.set({ clipboardHistory: clipboardHistory }, () => {
      filterHistory();
    });
  }
}

function updateItemCount() {
  const countElement = document.getElementById('itemCount');
  const count = clipboardHistory.length;
  countElement.textContent = `${count} ${count === 1 ? 'item' : 'items'}`;
}

function updateMatchCount(count) {
  const matchCountElement = document.getElementById('matchCount');
  if (count > 0) {
    matchCountElement.textContent = `${count} ${count === 1 ? 'X' : 'X'}`;
  } else {
    matchCountElement.textContent = '';
  }
}

function filterHistory() {
  const searchTerm = document.getElementById('searchBox').value.toLowerCase();
  
  if (!searchTerm) {
    displayHistory();
    updateMatchCount(0);
    return;
  }
  
  const filtered = clipboardHistory.filter(item => 
    item.text.toLowerCase().includes(searchTerm) ||
    (item.title && item.title.toLowerCase().includes(searchTerm)) ||
    (item.url && item.url.toLowerCase().includes(searchTerm)) ||
    (item.metaTags && item.metaTags.toLowerCase().includes(searchTerm))
  );
  
  displayHistory(filtered);
  updateMatchCount(filtered.length);
}

async function copyToClipboard(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    
    const originalBg = button.style.backgroundColor;
    button.style.backgroundColor = '#28a745';
    
    setTimeout(() => {
      button.style.backgroundColor = originalBg;
    }, 200);
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
  }
}

function clearHistory() {
  if (confirm('Are you sure you want to clear all clipboard history?')) {
    chrome.storage.local.set({ clipboardHistory: [] }, () => {
      clipboardHistory = [];
      displayHistory();
      updateItemCount();
      updateMatchCount(0);
    });
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getHostname(url) {
  if (url === 'manual') return 'Manual';
  try {
    return new URL(url).hostname;
  } catch {
    return 'Unknown';
  }
}

function detectRTL(text) {
  // Arabic: U+0600-U+06FF, U+0750-U+077F, U+08A0-U+08FF
  // Persian: Uses Arabic script + additional characters
  // Hebrew: U+0590-U+05FF
  const rtlRegex = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
  
  // Check first 10 characters for RTL content
  const firstChars = text.substring(0, 10);
  return rtlRegex.test(firstChars);
}