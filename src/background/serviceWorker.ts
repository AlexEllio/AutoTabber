import { findBestRuleMatch } from '../common/matcher';
import { getStorageData } from '../common/storage';
import { TabRule } from '../common/types';

// In-memory cache of manual overrides: tabId -> normalized URL at time of manual ungroup
const manualOverrides = new Map<number, string>();

// Mutex / in-flight tracker to prevent rapid duplicate groupings on rapid tab updates
const processingTabs = new Set<number>();

/**
 * Organizes a single tab into its matching tab group if a rule matches.
 */
async function processTab(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id || tab.pinned || !tab.url || tab.windowId === undefined) {
    return;
  }

  // Prevent recursive or concurrent processing of the same tab
  if (processingTabs.has(tab.id)) {
    return;
  }

  // Ignore internal Chrome or extension URLs
  if (
    tab.url.startsWith('chrome://') ||
    tab.url.startsWith('about:') ||
    tab.url.startsWith('chrome-extension://') ||
    tab.url.startsWith('devtools://')
  ) {
    return;
  }

  // Check manual override
  const overriddenUrl = manualOverrides.get(tab.id);
  if (overriddenUrl && overriddenUrl === tab.url) {
    return;
  }

  processingTabs.add(tab.id);

  try {
    const { rules } = await getStorageData();
    const match = findBestRuleMatch(rules, tab.url);

    if (!match) {
      return;
    }

    const targetRule = match.rule;

    // Check if the tab is already inside a group
    if (tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
      try {
        const currentGroup = await chrome.tabGroups.get(tab.groupId);
        if (currentGroup.title === targetRule.name) {
          // Already in the correct group
          return;
        }
      } catch {
        // Group may no longer exist
      }
    }

    // Find if a group with the target name already exists in this window
    const existingGroups = await chrome.tabGroups.query({ windowId: tab.windowId });
    const matchingGroup = existingGroups.find((g) => g.title === targetRule.name);

    if (matchingGroup) {
      await chrome.tabs.group({
        tabIds: [tab.id],
        groupId: matchingGroup.id
      });
      // Ensure group color matches rule color if not set
      if (matchingGroup.color !== targetRule.color) {
        await chrome.tabGroups.update(matchingGroup.id, { color: targetRule.color });
      }
    } else {
      // Create new group in this window
      const newGroupId = await chrome.tabs.group({
        tabIds: [tab.id],
        createProperties: { windowId: tab.windowId }
      });

      await chrome.tabGroups.update(newGroupId, {
        title: targetRule.name,
        color: targetRule.color
      });
    }
  } catch (err) {
    console.debug('AutoTabber: tab grouping skipped or failed:', err);
  } finally {
    processingTabs.delete(tab.id);
  }
}

/**
 * Organizes all tabs in a specified window (or all windows if unspecified).
 */
export async function organizeOpenTabs(windowId?: number): Promise<{ processedCount: number; groupedCount: number }> {
  const queryInfo: chrome.tabs.QueryInfo = windowId ? { windowId } : {};
  const tabs = await chrome.tabs.query(queryInfo);
  const { rules } = await getStorageData();

  let processedCount = 0;
  let groupedCount = 0;

  for (const tab of tabs) {
    if (!tab.id || tab.pinned || !tab.url) continue;
    processedCount++;

    const match = findBestRuleMatch(rules, tab.url);
    if (match) {
      // Clear any manual override when explicitly organizing tabs
      manualOverrides.delete(tab.id);
      await processTab(tab);
      groupedCount++;
    }
  }

  return { processedCount, groupedCount };
}

/**
 * Auto-collapse inactive groups if setting is enabled.
 */
async function handleAutoCollapse(activeInfo: chrome.tabs.TabActiveInfo): Promise<void> {
  try {
    const { settings } = await getStorageData();
    if (!settings.autoCollapseInactive) return;

    const activeTab = await chrome.tabs.get(activeInfo.tabId);
    const groups = await chrome.tabGroups.query({ windowId: activeInfo.windowId });

    for (const group of groups) {
      const isCurrentGroup = activeTab.groupId === group.id;
      if (isCurrentGroup && group.collapsed) {
        await chrome.tabGroups.update(group.id, { collapsed: false });
      } else if (!isCurrentGroup && !group.collapsed) {
        await chrome.tabGroups.update(group.id, { collapsed: true });
      }
    }
  } catch (err) {
    console.debug('AutoTabber: Auto-collapse handling error:', err);
  }
}

// ------------------- EVENT LISTENERS -------------------

// Tab creation listener
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.url) {
    processTab(tab);
  }
});

// Tab update listener (URL changes or navigation finishes)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    // If URL changed, clear any previous manual override for this tab
    manualOverrides.delete(tabId);
  }

  if (tab.url && (changeInfo.url || changeInfo.status === 'complete')) {
    processTab(tab);
  }
});

// Tab removal listener
chrome.tabs.onRemoved.addListener((tabId) => {
  manualOverrides.delete(tabId);
  processingTabs.delete(tabId);
});

// Tab activation listener (for auto-collapse feature)
chrome.tabs.onActivated.addListener((activeInfo) => {
  handleAutoCollapse(activeInfo);
});

// Listen for manual ungrouping: when tab's groupId becomes TAB_GROUP_ID_NONE
// Chrome triggers onUpdated with changeInfo.groupId
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
    // Tab was removed from group; record manual override
    if (tab.url) {
      manualOverrides.set(tabId, tab.url);
    }
  }
});

// Messages from Popup or Options UI
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'ORGANIZE_TABS') {
    organizeOpenTabs(message.windowId)
      .then((res) => sendResponse({ success: true, ...res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }

  if (message.action === 'RULES_UPDATED') {
    if (message.reorganize) {
      organizeOpenTabs()
        .then((res) => sendResponse({ success: true, ...res }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }
    sendResponse({ success: true });
  }

  return false;
});

// On extension installed or browser startup
chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await getStorageData();
  if (settings.retroactiveGroupingOnStartup) {
    await organizeOpenTabs();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const { settings } = await getStorageData();
  if (settings.retroactiveGroupingOnStartup) {
    await organizeOpenTabs();
  }
});
