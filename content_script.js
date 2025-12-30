// Focus Overlay - Content Script
// Main controller for overlay logic

(function() {
  'use strict';

  // Configuration
  const UNLOCK_MINUTES = 1; // Minutes to unlock when user clicks "Continue Anyway"
  const BLOCKED_SITES = ['youtube.com', 'www.youtube.com', 'instagram.com', 'www.instagram.com'];

  // Get hostname from current URL
  function getHostname() {
    try {
      return window.location.hostname;
    } catch (e) {
      // Fallback for document_start
      const url = document.URL || document.location?.href || '';
      const match = url.match(/https?:\/\/([^\/]+)/);
      return match ? match[1] : '';
    }
  }

  // Get storage key for unlock timestamp
  function getUnlockKey(hostname) {
    return `unlock_until_${hostname}`;
  }

  // Check if site should be blocked
  function isBlockedSite(hostname) {
    return BLOCKED_SITES.includes(hostname);
  }

  // Store unlock timestamp (fire-and-forget, no await)
  function storeUnlockTimestamp(hostname, unlockUntil) {
    const unlockKey = getUnlockKey(hostname);
    // Fire-and-forget: do NOT await to avoid context invalidation
    chrome.storage.local.set({ [unlockKey]: unlockUntil }).catch(() => {
      // Silently ignore errors - context may be invalidated
    });
  }

  // Global variable to track unlock monitoring interval
  let unlockCheckInterval = null;

  // Create "Session Ended" overlay
  function createSessionEndedOverlay() {
    // Remove any existing overlay first
    const existing = document.getElementById('focus-overlay-blocker');
    if (existing) {
      existing.remove();
    }

    // Create overlay container
    const overlay = document.createElement('div');
    overlay.id = 'focus-overlay-blocker';
    overlay.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
      z-index: 2147483647 !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif !important;
      color: white !important;
      box-sizing: border-box !important;
      padding: 20px !important;
      overflow: hidden !important;
      pointer-events: auto !important;
    `;

    // Create content container
    const content = document.createElement('div');
    content.style.cssText = `
      text-align: center !important;
      max-width: 500px !important;
      padding: 40px !important;
      background: rgba(255, 255, 255, 0.1) !important;
      border-radius: 20px !important;
      backdrop-filter: blur(10px) !important;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3) !important;
      pointer-events: auto !important;
    `;

    // Create title
    const title = document.createElement('h1');
    title.textContent = 'Session Ended';
    title.style.cssText = `
      font-size: 32px !important;
      font-weight: 700 !important;
      margin: 0 0 16px 0 !important;
      color: white !important;
    `;

    // Create message
    const message = document.createElement('p');
    message.textContent = 'Your unlock period has expired. This site is now blocked again.';
    message.style.cssText = `
      font-size: 18px !important;
      margin: 0 !important;
      color: rgba(255, 255, 255, 0.9) !important;
      line-height: 1.6 !important;
    `;

    // Assemble overlay
    content.appendChild(title);
    content.appendChild(message);
    overlay.appendChild(content);

    // Block all interactions
    overlay.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
    }, true);

    overlay.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
    }, true);

    overlay.addEventListener('wheel', (e) => {
      e.stopPropagation();
      e.preventDefault();
    }, true);

    overlay.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      e.preventDefault();
    }, true);

    overlay.addEventListener('touchmove', (e) => {
      e.stopPropagation();
      e.preventDefault();
    }, true);

    overlay.addEventListener('keydown', (e) => {
      e.stopPropagation();
      e.preventDefault();
    }, true);

    // Inject overlay
    if (document.documentElement) {
      document.documentElement.appendChild(overlay);
    } else if (document.body) {
      document.body.appendChild(overlay);
    } else {
      const observer = new MutationObserver(() => {
        if (document.documentElement || document.body) {
          (document.documentElement || document.body).appendChild(overlay);
          observer.disconnect();
        }
      });
      observer.observe(document, { childList: true, subtree: true });
    }

    // Block body scroll
    const blockScroll = () => {
      if (document.body) {
        document.body.style.overflow = 'hidden';
      }
      if (document.documentElement) {
        document.documentElement.style.overflow = 'hidden';
      }
    };

    if (document.body || document.documentElement) {
      blockScroll();
    } else {
      const bodyObserver = new MutationObserver(() => {
        if (document.body || document.documentElement) {
          blockScroll();
          bodyObserver.disconnect();
        }
      });
      bodyObserver.observe(document, { childList: true, subtree: true });
    }
  }

  // Start monitoring unlock expiration
  function startUnlockMonitoring(hostname) {
    // Clear any existing interval
    stopUnlockMonitoring();

    // Check every 5 seconds if unlock has expired
    unlockCheckInterval = setInterval(() => {
      const unlockKey = getUnlockKey(hostname);
      chrome.storage.local.get([unlockKey], (result) => {
        if (chrome.runtime.lastError) {
          stopUnlockMonitoring();
          return;
        }

        const unlockUntil = result[unlockKey];

        // If unlock has expired or doesn't exist, show session ended overlay
        if (!unlockUntil || Date.now() >= unlockUntil) {
          stopUnlockMonitoring();
          if (document.readyState === 'complete' || document.readyState === 'interactive') {
            createSessionEndedOverlay();
          } else {
            document.addEventListener('DOMContentLoaded', () => {
              createSessionEndedOverlay();
            }, { once: true });
          }
        }
      });
    }, 5000); // Check every 5 seconds
  }

  // Stop monitoring unlock expiration
  function stopUnlockMonitoring() {
    if (unlockCheckInterval) {
      clearInterval(unlockCheckInterval);
      unlockCheckInterval = null;
    }
  }

  // Create and inject the overlay (ATOMIC - all-or-nothing)
  function createOverlay() {
    // Remove any existing overlay first
    const existing = document.getElementById('focus-overlay-blocker');
    if (existing) {
      existing.remove();
    }

    const hostname = getHostname();

    // Create overlay container - this blocks ALL interactions via CSS pointer-events
    const overlay = document.createElement('div');
    overlay.id = 'focus-overlay-blocker';
    overlay.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
      z-index: 2147483647 !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif !important;
      color: white !important;
      box-sizing: border-box !important;
      padding: 20px !important;
      overflow: hidden !important;
      pointer-events: auto !important;
    `;

    // Create content container
    const content = document.createElement('div');
    content.style.cssText = `
      text-align: center !important;
      max-width: 500px !important;
      padding: 40px !important;
      background: rgba(255, 255, 255, 0.1) !important;
      border-radius: 20px !important;
      backdrop-filter: blur(10px) !important;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3) !important;
      pointer-events: auto !important;
    `;

    // Create title
    const title = document.createElement('h1');
    title.textContent = 'Focus Mode Active';
    title.style.cssText = `
      font-size: 32px !important;
      font-weight: 700 !important;
      margin: 0 0 16px 0 !important;
      color: white !important;
    `;

    // Create message
    const message = document.createElement('p');
    message.textContent = 'This site is blocked to help you stay focused.';
    message.style.cssText = `
      font-size: 18px !important;
      margin: 0 0 32px 0 !important;
      color: rgba(255, 255, 255, 0.9) !important;
      line-height: 1.6 !important;
    `;

    // Create button - MUST be clickable
    const button = document.createElement('button');
    button.textContent = 'Continue Anyway';
    
    // Function to set button disabled state
    const setButtonDisabled = (disabled) => {
      button.disabled = disabled;
      if (disabled) {
        button.style.cssText = `
          background: rgba(255, 255, 255, 0.1) !important;
          border: 2px solid rgba(255, 255, 255, 0.2) !important;
          color: rgba(255, 255, 255, 0.5) !important;
          padding: 14px 32px !important;
          font-size: 16px !important;
          font-weight: 600 !important;
          border-radius: 12px !important;
          cursor: not-allowed !important;
          transition: all 0.3s ease !important;
          font-family: inherit !important;
          pointer-events: none !important;
          position: relative !important;
          z-index: 2147483648 !important;
        `;
      } else {
        button.style.cssText = `
          background: rgba(255, 255, 255, 0.2) !important;
          border: 2px solid rgba(255, 255, 255, 0.3) !important;
          color: white !important;
          padding: 14px 32px !important;
          font-size: 16px !important;
          font-weight: 600 !important;
          border-radius: 12px !important;
          cursor: pointer !important;
          transition: all 0.3s ease !important;
          font-family: inherit !important;
          pointer-events: auto !important;
          position: relative !important;
          z-index: 2147483648 !important;
        `;
      }
    };

    // Initially disable the button
    setButtonDisabled(true);

    // Enable button after 10 seconds (countdown hidden from UI)
    const enableTimer = setTimeout(() => {
      setButtonDisabled(false);
    }, 10000); // 10 seconds

    // Button hover effect (only when enabled)
    button.addEventListener('mouseenter', () => {
      if (!button.disabled) {
        button.style.background = 'rgba(255, 255, 255, 0.3)';
        button.style.borderColor = 'rgba(255, 255, 255, 0.5)';
      }
    });
    button.addEventListener('mouseleave', () => {
      if (!button.disabled) {
        button.style.background = 'rgba(255, 255, 255, 0.2)';
        button.style.borderColor = 'rgba(255, 255, 255, 0.3)';
      }
    });

    // Function to show time selection options
    const showTimeSelection = () => {
      // Hide the button and message
      button.style.display = 'none';
      message.style.display = 'none';
      
      // Update title
      title.textContent = 'Choose Unlock Duration';
      
      // Create time selection subtitle
      const timeSubtitle = document.createElement('p');
      timeSubtitle.textContent = 'Select how long you want to unlock this site:';
      timeSubtitle.style.cssText = `
        font-size: 18px !important;
        margin: 0 0 32px 0 !important;
        color: rgba(255, 255, 255, 0.9) !important;
        line-height: 1.6 !important;
      `;
      
      // Create time options container
      const timeOptions = document.createElement('div');
      timeOptions.style.cssText = `
        display: flex !important;
        gap: 16px !important;
        justify-content: center !important;
        flex-wrap: wrap !important;
      `;
      
      // Time options: 5, 10, 20 minutes
      const timeOptionsList = [1, 10, 20];
      
      timeOptionsList.forEach((minutes) => {
        const timeButton = document.createElement('button');
        timeButton.textContent = `${minutes} min`;
        timeButton.style.cssText = `
          background: rgba(255, 255, 255, 0.2) !important;
          border: 2px solid rgba(255, 255, 255, 0.3) !important;
          color: white !important;
          padding: 12px 24px !important;
          font-size: 16px !important;
          font-weight: 600 !important;
          border-radius: 12px !important;
          cursor: pointer !important;
          transition: all 0.3s ease !important;
          font-family: inherit !important;
          pointer-events: auto !important;
          min-width: 100px !important;
        `;
        
        // Hover effect
        timeButton.addEventListener('mouseenter', () => {
          timeButton.style.background = 'rgba(255, 255, 255, 0.3)';
          timeButton.style.borderColor = 'rgba(255, 255, 255, 0.5)';
        });
        timeButton.addEventListener('mouseleave', () => {
          timeButton.style.background = 'rgba(255, 255, 255, 0.2)';
          timeButton.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        });
        
        // Click handler for time selection
        timeButton.addEventListener('click', (e) => {
          e.stopPropagation();
          
          // Calculate unlock timestamp with selected minutes
          const unlockUntil = Date.now() + (minutes * 60 * 1000);
          
          // Store unlock timestamp (fire-and-forget)
          storeUnlockTimestamp(hostname, unlockUntil);
          
          // Remove overlay immediately
          overlay.remove();
          
          // Restore scroll
          if (document.body) {
            document.body.style.overflow = '';
          }
          if (document.documentElement) {
            document.documentElement.style.overflow = '';
          }
          
          startUnlockMonitoring(hostname);
        }, false);
        
        timeOptions.appendChild(timeButton);
      });
      
      // Insert subtitle and time options before the hidden message
      content.insertBefore(timeSubtitle, message);
      content.insertBefore(timeOptions, message);
    };

    // Button click handler - show time selection
    button.addEventListener('click', (e) => {
      // Prevent click if button is disabled
      if (button.disabled) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Clear the enable timer if it's still running
      clearTimeout(enableTimer);
      
      // Show time selection instead of immediately unlocking
      showTimeSelection();
    }, false); 

    // Assemble overlay
    content.appendChild(title);
    content.appendChild(message);
    content.appendChild(button);
    overlay.appendChild(content);

    // Block interactions ONLY via overlay container
    // Use capture phase to intercept events before they reach page content
    overlay.addEventListener('click', (e) => {
      // Allow button clicks to pass through
      if (e.target === button || button.contains(e.target) || content.contains(e.target)) {
        return; // Let button/content handle the event
      }
      // Block all other clicks
      e.stopPropagation();
      e.preventDefault();
    }, true);

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === button || button.contains(e.target) || content.contains(e.target)) {
        return;
      }
      e.stopPropagation();
      e.preventDefault();
    }, true);

    overlay.addEventListener('wheel', (e) => {
      if (content.contains(e.target)) {
        return; // Allow scrolling within content area
      }
      e.stopPropagation();
      e.preventDefault();
    }, true);

    overlay.addEventListener('touchstart', (e) => {
      if (e.target === button || button.contains(e.target) || content.contains(e.target)) {
        return;
      }
      e.stopPropagation();
      e.preventDefault();
    }, true);

    overlay.addEventListener('touchmove', (e) => {
      if (content.contains(e.target)) {
        return;
      }
      e.stopPropagation();
      e.preventDefault();
    }, true);

    // Block keyboard input on overlay (but allow button to receive focus)
    overlay.addEventListener('keydown', (e) => {
      if (e.target === button || button.contains(e.target)) {
        // Allow Enter/Space on button
        if (e.key === 'Enter' || e.key === ' ') {
          return;
        }
      }
      e.stopPropagation();
      e.preventDefault();
    }, true);

    // Inject overlay atomically
    if (document.documentElement) {
      document.documentElement.appendChild(overlay);
    } else if (document.body) {
      document.body.appendChild(overlay);
    } else {
      // Wait for DOM
      const observer = new MutationObserver(() => {
        if (document.documentElement || document.body) {
          (document.documentElement || document.body).appendChild(overlay);
          observer.disconnect();
        }
      });
      observer.observe(document, { childList: true, subtree: true });
    }

    // Block body scroll (only when overlay is active)
    const blockScroll = () => {
      if (document.body) {
        document.body.style.overflow = 'hidden';
      }
      if (document.documentElement) {
        document.documentElement.style.overflow = 'hidden';
      }
    };

    // Try to block scroll immediately
    if (document.body || document.documentElement) {
      blockScroll();
    } else {
      // Wait for body
      const bodyObserver = new MutationObserver(() => {
        if (document.body || document.documentElement) {
          blockScroll();
          bodyObserver.disconnect();
        }
      });
      bodyObserver.observe(document, { childList: true, subtree: true });
    }
  }

  // Main initialization function
  // CRITICAL: Checks unlock status FIRST before injecting anything
  function checkAndInjectIfNeeded() {
    const hostname = getHostname();

    // Check if site should be blocked
    if (!isBlockedSite(hostname)) {
      return; // Exit immediately if not a blocked site
    }

    // STEP 1: Check unlock status FIRST (before any DOM injection)
    const unlockKey = getUnlockKey(hostname);
    
    // Use callback-based API to avoid async/await issues
    chrome.storage.local.get([unlockKey], (result) => {
      // Handle errors gracefully
      if (chrome.runtime.lastError) {
        // On error, show overlay to be safe (fail-secure)
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', createOverlay, { once: true });
        } else {
          createOverlay();
        }
        return;
      }

      const unlockUntil = result[unlockKey];

      // STEP 2: If unlocked (Date.now() < unlockUntil), start monitoring for expiration
      if (unlockUntil && Date.now() < unlockUntil) {
        // Start monitoring unlock expiration
        startUnlockMonitoring(hostname);
        return; // Exit immediately - site is unlocked, do nothing
      }

      // STEP 3: Only if locked (Date.now() >= unlockUntil), inject overlay
      // Stop monitoring since site is locked
      stopUnlockMonitoring();
      // This is the ONLY place where overlay is created
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createOverlay, { once: true });
      } else {
        createOverlay();
      }
    });
  }

  // Run unlock check immediately at document_start
  // This is the ONLY entry point - no overlay injection happens before this check
  checkAndInjectIfNeeded();

  // Listen for navigation events (for SPAs like YouTube)
  let lastUrl = location.href;
  
  // Use multiple methods to detect SPA navigation
  const checkNavigation = () => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      // Stop any existing monitoring
      stopUnlockMonitoring();
      // Remove any existing overlay and re-check unlock status
      const existing = document.getElementById('focus-overlay-blocker');
      if (existing) {
        existing.remove();
        // Restore scroll
        if (document.body) {
          document.body.style.overflow = '';
        }
        if (document.documentElement) {
          document.documentElement.style.overflow = '';
        }
      }
      // Re-check unlock status (will only inject if locked, exits if unlocked)
      checkAndInjectIfNeeded();
    }
  };

  // MutationObserver for DOM changes (SPA navigation)
  new MutationObserver(checkNavigation).observe(document, { 
    subtree: true, 
    childList: true,
    attributes: true,
    attributeFilter: ['href']
  });

  // Listen for popstate (back/forward navigation)
  window.addEventListener('popstate', checkNavigation);

  // Listen for pushstate/replacestate (SPA navigation)
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function() {
    originalPushState.apply(history, arguments);
    setTimeout(checkNavigation, 50);
  };
  
  history.replaceState = function() {
    originalReplaceState.apply(history, arguments);
    setTimeout(checkNavigation, 50);
  };

})();
