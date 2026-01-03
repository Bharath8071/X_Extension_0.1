// Focus Overlay - Background Service Worker
// Handles Notion API calls and message passing

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

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'FETCH_NOTION_TASKS') {
    // Fetch tasks from Notion API
    fetchNotionTasks()
      .then(tasks => {
        sendResponse({ success: true, tasks });
      })
      .catch(error => {
        console.error('Error fetching Notion tasks:', error);
        // Return empty list on error
        sendResponse({ success: false, tasks: [] });
      });
    // Return true to indicate we will send a response asynchronously
    return true;
  }
});

/**
 * Fetches tasks from Notion database
 * Returns array of simplified task objects with title property only
 */
async function fetchNotionTasks() {
  // Get API token and database ID from storage
  const result = await chrome.storage.local.get(['notion_api_token', 'notion_db_id']);
  const apiToken = result.notion_api_token;
  const dbId = result.notion_db_id;

  // Return empty array if credentials are missing
  if (!apiToken || !dbId) {
    return [];
  }

  try {
    // Query Notion database
    const response = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        page_size: 100 // Get more than needed, then filter and limit
      })
    });

    if (!response.ok) {
      throw new Error(`Notion API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const pages = data.results || [];

    // Filter for incomplete tasks
    // Exclude tasks that are marked as completed (Status = "Done"/"Completed" OR Checkbox = true)
    const incompleteTasks = pages.filter(page => {
      const properties = page.properties || {};
      
      // Priority 1: Check Status property (if it exists and is "Done"/"Completed", exclude)
      if (properties.Status && properties.Status.type === 'status') {
        const status = properties.Status.status?.name;
        if (status === 'Done' || status === 'Completed') {
          return false; // Exclude completed tasks
        }
        // Status exists and is not completed, include it
        return true;
      }
      
      // Priority 2: Check Checkbox properties (if checked, exclude)
      // Common property names: Done, Completed, Checked
      for (const propName in properties) {
        const prop = properties[propName];
        if (prop.type === 'checkbox' && prop.checkbox === true) {
          return false; // Exclude if any checkbox is checked (marked as done)
        }
      }
      
      // If no Status property and no checked checkbox found, include it (default to incomplete)
      return true;
    });

    // Extract title from page properties
    // Notion title properties are arrays of rich text objects
    const tasks = incompleteTasks.slice(0, 3).map(page => {
      const properties = page.properties || {};
      let title = 'Untitled Task';
      
      // Find title property (type === 'title')
      for (const propName in properties) {
        const prop = properties[propName];
        if (prop.type === 'title' && prop.title && Array.isArray(prop.title) && prop.title.length > 0) {
          // Extract plain text from first title element
          const firstTitle = prop.title[0];
          if (firstTitle.plain_text) {
            title = firstTitle.plain_text;
          } else if (firstTitle.text && firstTitle.text.content) {
            title = firstTitle.text.content;
          }
          break;
        }
      }
      
      return { title };
    });

    return tasks;
  } catch (error) {
    console.error('Error fetching Notion tasks:', error);
    // Return empty array on error
    return [];
  }
}

 