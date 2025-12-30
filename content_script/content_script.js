// Focus Overlay - Content Script
// Main controller for overlay logic

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  const UNLOCK_MINUTES = 1; // Minutes to unlock when user clicks "Continue Anyway"
  const BLOCKED_SITES = ['youtube.com', 'www.youtube.com', 'instagram.com', 'www.instagram.com'];
  const TIME_OPTIONS = [UNLOCK_MINUTES, 10, 20]; // Minutes for time selection

  // ============================================================================
  // CSS INJECTION
  // ============================================================================
  // Note: CSS is automatically injected by Chrome via manifest.json
  // No manual injection needed

  // ============================================================================
  // HTML TEMPLATES
  // ============================================================================
  
  /**
   * Creates overlay container element
   */
  function createOverlayContainer() {
    const overlay = document.createElement('div');
    overlay.id = 'focus-overlay-blocker';
    return overlay;
  }

  /**
   * Creates content container element
   */
  function createContentContainer() {
    const content = document.createElement('div');
    content.className = 'overlay-content';
    return content;
  }

  /**
   * Creates title element
   */
  function createTitle(text) {
    const title = document.createElement('h1');
    title.className = 'overlay-title';
    title.textContent = text;
    return title;
  }

  /**
   * Creates message element
   */
  function createMessage(text, isSessionEnded = false) {
    const message = document.createElement('p');
    message.className = isSessionEnded ? 'overlay-message session-ended' : 'overlay-message';
    message.textContent = text;
    return message;
  }

  /**
   * Creates main button element
   */
  function createButton(text) {
    const button = document.createElement('button');
    button.className = 'overlay-button';
    button.textContent = text;
    return button;
  }

  /**
   * Creates time selection subtitle
   */
  function createTimeSubtitle() {
    const subtitle = document.createElement('p');
    subtitle.className = 'time-subtitle';
    subtitle.textContent = 'Select how long you want to unlock this site:';
    return subtitle;
  }

  /**
   * Creates time options container
   */
  function createTimeOptionsContainer() {
    const container = document.createElement('div');
    container.className = 'time-options';
    return container;
  }

  /**
   * Creates time selection button
   */
  function createTimeButton(minutes) {
    const button = document.createElement('button');
    button.className = 'time-button';
    button.textContent = `${minutes} min`;
    return button;
  }

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================
  
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

  // Block body scroll
  function blockScroll() {
    if (document.body) {
      document.body.style.overflow = 'hidden';
    }
    if (document.documentElement) {
      document.documentElement.style.overflow = 'hidden';
    }
  }

  // Restore body scroll
  function restoreScroll() {
    if (document.body) {
      document.body.style.overflow = '';
    }
    if (document.documentElement) {
      document.documentElement.style.overflow = '';
    }
  }

  // Inject element into DOM
  function injectElement(element) {
    if (document.documentElement) {
      document.documentElement.appendChild(element);
    } else if (document.body) {
      document.body.appendChild(element);
    } else {
      const observer = new MutationObserver(() => {
        if (document.documentElement || document.body) {
          (document.documentElement || document.body).appendChild(element);
          observer.disconnect();
        }
      });
      observer.observe(document, { childList: true, subtree: true });
    }
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================
  
  /**
   * Attaches event blockers to overlay
   */
  function attachEventBlockers(overlay, content) {
    const blockEvent = (e) => {
      if (content.contains(e.target)) {
        // Allow Enter/Space on buttons within content
        if (e.type === 'keydown' && (e.key === 'Enter' || e.key === ' ')) {
          return;
        }
        // Allow other events within content area
        if (e.type !== 'keydown') {
          return;
        }
      }
      e.stopPropagation();
      e.preventDefault();
    };

    overlay.addEventListener('click', blockEvent, true);
    overlay.addEventListener('mousedown', blockEvent, true);
    overlay.addEventListener('wheel', (e) => {
      if (content.contains(e.target)) {
        return; // Allow scrolling within content area
      }
      blockEvent(e);
    }, true);
    overlay.addEventListener('touchstart', blockEvent, true);
    overlay.addEventListener('touchmove', (e) => {
      if (content.contains(e.target)) {
        return;
      }
      blockEvent(e);
    }, true);
    overlay.addEventListener('keydown', blockEvent, true);
  }

  // ============================================================================
  // UNLOCK MONITORING
  // ============================================================================
  
  // Global variable to track unlock monitoring interval
  let unlockCheckInterval = null;

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

          chrome.storage.local.remove(getUnlockKey(hostname));

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

  // ============================================================================
  // OVERLAY CREATION
  // ============================================================================

  /**
   * Creates "Session Ended" overlay
   */
  function createSessionEndedOverlay() {
    // Remove any existing overlay first
    const existing = document.getElementById('focus-overlay-blocker');
    if (existing) {
      existing.remove();
    }

    // Create HTML structure using template functions
    const overlay = createOverlayContainer();
    overlay.classList.add('session-ended');

    const content = createContentContainer();
    content.className = 'overlay-content';

    const title = createTitle('Session Ended');
    title.className = 'overlay-title';

    const message = createMessage('Your unlock period has expired. This site is now blocked again.', true);
    message.className = 'overlay-message session-ended';

    // Assemble overlay
    content.appendChild(title);
    content.appendChild(message);
    overlay.appendChild(content);

    // Attach event blockers
    attachEventBlockers(overlay, content);

    // Inject overlay
    injectElement(overlay);

    // Block body scroll
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

  /**
   * Creates and injects the main overlay (ATOMIC - all-or-nothing)
   */
  function createOverlay() {
    // Remove any existing overlay first
    const existing = document.getElementById('focus-overlay-blocker');
    if (existing) {
      existing.remove();
    }

    const hostname = getHostname();

    // Create HTML structure using template functions
    const overlay = createOverlayContainer();
    const content = createContentContainer();
    const title = createTitle('Focus Mode Active');
    const message = createMessage('This site is blocked to help you stay focused.');
    const button = createButton('Continue Anyway');

    // Function to set button disabled state
    const setButtonDisabled = (disabled) => {
      button.disabled = disabled;
    };

    // Initially disable the button
    setButtonDisabled(true);

    // Enable button after 10 seconds (countdown hidden from UI)
    const enableTimer = setTimeout(() => {
      setButtonDisabled(false);
    }, 10000); // 10 seconds

    // Function to show time selection options
    const showTimeSelection = () => {
      // Hide the button and message
      button.style.display = 'none';
      message.style.display = 'none';

      // Update title
      title.textContent = 'Choose Unlock Duration';

      // Create time selection elements
      const timeSubtitle = createTimeSubtitle();
      const timeOptions = createTimeOptionsContainer();

      // Create time buttons
      TIME_OPTIONS.forEach((minutes) => {
        const timeButton = createTimeButton(minutes);

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
          restoreScroll();

          // Start monitoring unlock expiration
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

    // Attach event blockers
    attachEventBlockers(overlay, content);

    // Inject overlay atomically
    injectElement(overlay);

    // Block body scroll (only when overlay is active)
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

  // ============================================================================
  // MAIN INITIALIZATION
  // ============================================================================

  /**
   * Main initialization function
   * CRITICAL: Checks unlock status FIRST before injecting anything
   */
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

  // ============================================================================
  // NAVIGATION MONITORING (for SPAs like YouTube)
  // ============================================================================

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
        restoreScroll();
      }
      // Re-check unlock status (will only inject if locked, exits if unlocked)
      checkAndInjectIfNeeded();
    }
  };

  let navCheckTimeout = null;

  function throttledCheckNavigation() {
    if (navCheckTimeout) return;

    navCheckTimeout = setTimeout(() => {
      navCheckTimeout = null;
      checkNavigation();
    }, 300);
  }


  // MutationObserver for DOM changes (SPA navigation)
  new MutationObserver(throttledCheckNavigation).observe(document, {
    subtree: true,
    childList: true
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

