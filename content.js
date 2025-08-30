// Clipo/content.js

let lastClipboardContent = '';

console.log('Clipo content script loaded on:', window.location.href);

function getMetaTags() {
  const description = document.querySelector('meta[name="description"]')?.content || '';
  const keywords = document.querySelector('meta[name="keywords"]')?.content || '';
  return `${description} ${keywords}`.trim();
}

/**
 * Handles the copied text by sending it to the background script.
 * @param {string} copiedText - The text that was copied by the user.
 */
function handleCopy(copiedText) {
  console.log('handleCopy called with:', copiedText.substring(0, 50) + '...');
  const trimmedText = copiedText.trim();
  
  if (trimmedText && trimmedText !== lastClipboardContent) {
    lastClipboardContent = trimmedText;
    console.log('Preparing to save clipboard item');

    const now = new Date();
    const clipboardItem = {
      text: trimmedText,
      timestamp: now.toLocaleString(),
      createdAt: now.getTime(),
      url: window.location.href,
      title: document.title,
      pinned: false,
      metaTags: getMetaTags()
    };
    
    // Send the new clipboard item to the background script
    console.log('Sending message to background script...');
    chrome.runtime.sendMessage({
      type: 'saveClipboardItem',
      payload: clipboardItem
    }).then((response) => {
      console.log('Message sent successfully, response:', response);
    }).catch(error => {
      console.error('Failed to send message:', error);
    });
  } else {
    console.log('Text not saved - either empty or duplicate');
  }
}

// Listen for copy events
document.addEventListener('copy', (event) => {
  console.log('Copy event detected');
  try {
    const selection = window.getSelection().toString();
    if (selection) {
      console.log('Selected text found:', selection.substring(0, 50) + '...');
      handleCopy(selection);
    } else {
      console.log('No text selection found');
    }
  } catch (error) {
    console.error('Error in copy event handler:', error);
  }
});

// Listen for keyboard copy shortcuts
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
    console.log('Copy keyboard shortcut detected');
    // Small delay to allow selection processing
    setTimeout(() => {
      try {
        const selection = window.getSelection().toString();
        if (selection) {
          console.log('Text selection after keyboard copy:', selection.substring(0, 50) + '...');
          handleCopy(selection);
        } else {
          console.log('No text selection after keyboard copy');
        }
      } catch (error) {
        console.error('Error in keyboard copy handler:', error);
      }
    }, 50);
  }
});

console.log('Clipo content script setup complete');