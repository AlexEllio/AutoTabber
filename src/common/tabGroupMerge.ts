import { ChromeGroupColor } from './types';

export async function requestTabGroupMerge(name: string, color: ChromeGroupColor): Promise<void> {
  const response = await chrome.runtime.sendMessage({
    action: 'MERGE_CHROME_TAB_GROUPS',
    name,
    color
  });
  if (!response || response.success !== true) {
    throw new Error(response?.error || 'Existing Chrome tab groups could not be merged.');
  }
}
