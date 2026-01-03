// Popup script for Notion settings
// Stores API token and database ID in chrome.storage.local

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('settings-form');
  const apiTokenInput = document.getElementById('api-token');
  const dbIdInput = document.getElementById('db-id');
  const statusDiv = document.getElementById('status');

  // Load existing settings
  chrome.storage.local.get(['notion_api_token', 'notion_db_id'], (result) => {
    if (result.notion_api_token) {
      apiTokenInput.value = result.notion_api_token;
    }
    if (result.notion_db_id) {
      dbIdInput.value = result.notion_db_id;
    }
  });

  // Handle form submission
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const apiToken = apiTokenInput.value.trim();
    const dbId = dbIdInput.value.trim();

    if (!apiToken || !dbId) {
      showStatus('Please fill in all fields', 'error');
      return;
    }

    // Store settings in chrome.storage.local
    chrome.storage.local.set({
      notion_api_token: apiToken,
      notion_db_id: dbId
    }, () => {
      if (chrome.runtime.lastError) {
        showStatus('Error saving settings: ' + chrome.runtime.lastError.message, 'error');
      } else {
        showStatus('Settings saved successfully!', 'success');
      }
    });
  });

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
    setTimeout(() => {
      statusDiv.className = 'status';
    }, 3000);
  }
});

