import { addRule, CHROME_GROUP_COLORS, deleteRule, getStorageData, updateRule } from '../common/storage';
import { ChromeGroupColor, TabRule } from '../common/types';

let selectedColor: ChromeGroupColor = 'blue';

document.addEventListener('DOMContentLoaded', async () => {
  initColorPicker();
  await inspectCurrentTab();
  await renderRulesList();
  setupEventListeners();
});

function initColorPicker(): void {
  const container = document.getElementById('quick-color-picker');
  if (!container) return;

  container.innerHTML = '';
  CHROME_GROUP_COLORS.forEach((color) => {
    const dot = document.createElement('div');
    dot.className = `color-dot ${color === selectedColor ? 'selected' : ''}`;
    dot.style.backgroundColor = `var(--color-${color})`;
    dot.title = color;
    dot.addEventListener('click', () => {
      selectedColor = color;
      document.querySelectorAll('.color-dot').forEach((d) => d.classList.remove('selected'));
      dot.classList.add('selected');
    });
    container.appendChild(dot);
  });
}

async function inspectCurrentTab(): Promise<void> {
  const nameInput = document.getElementById('quick-rule-name') as HTMLInputElement | null;
  const patternInput = document.getElementById('quick-rule-pattern') as HTMLInputElement | null;

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.url) return;

    const urlStr = activeTab.url;
    if (urlStr.startsWith('chrome://') || urlStr.startsWith('about:')) return;

    const url = new URL(urlStr);
    const host = url.hostname.replace(/^www\./, '');
    const pathParts = url.pathname.split('/').filter(Boolean);

    let suggestedName = host.split('.')[0] || 'My Group';
    suggestedName = suggestedName.charAt(0).toUpperCase() + suggestedName.slice(1);

    let suggestedPattern = host;

    // Special detection for popular multi-product suites like Atlassian
    if (host.includes('atlassian.net') && pathParts.length > 0) {
      const product = pathParts[0].toLowerCase();
      if (product === 'wiki') {
        suggestedName = 'Confluence';
        suggestedPattern = 'atlassian.net/wiki*';
        selectedColor = 'green';
      } else if (product === 'jira') {
        suggestedName = 'Jira';
        suggestedPattern = 'atlassian.net/jira*';
        selectedColor = 'blue';
      } else {
        suggestedPattern = `atlassian.net/${product}*`;
      }
    } else if (pathParts.length > 0) {
      suggestedPattern = `${host}/${pathParts[0]}*`;
    } else {
      suggestedPattern = `${host}*`;
    }

    if (nameInput) nameInput.value = suggestedName;
    if (patternInput) patternInput.value = suggestedPattern;

    // Re-highlight color if changed
    document.querySelectorAll('.color-dot').forEach((d) => {
      const title = d.getAttribute('title');
      if (title === selectedColor) {
        d.classList.add('selected');
      } else {
        d.classList.remove('selected');
      }
    });
  } catch (err) {
    console.debug('Failed to inspect current tab:', err);
  }
}

async function renderRulesList(): Promise<void> {
  const listEl = document.getElementById('rules-list');
  const countEl = document.getElementById('rules-count');
  if (!listEl) return;

  const { rules } = await getStorageData();
  if (countEl) countEl.textContent = rules.length.toString();

  if (rules.length === 0) {
    listEl.innerHTML = '<div class="feedback-msg">No rules yet. Add your first rule above!</div>';
    return;
  }

  listEl.innerHTML = '';
  rules.forEach((rule) => {
    const item = document.createElement('div');
    item.className = 'rule-item';

    const info = document.createElement('div');
    info.className = 'rule-info';

    const badge = document.createElement('div');
    badge.className = 'rule-badge';
    badge.style.backgroundColor = `var(--color-${rule.color})`;

    const texts = document.createElement('div');
    texts.className = 'rule-texts';

    const name = document.createElement('div');
    name.className = 'rule-name';
    name.textContent = rule.name;

    const pattern = document.createElement('div');
    pattern.className = 'rule-pattern';
    pattern.textContent = rule.patterns.join(', ') || 'No patterns';

    texts.appendChild(name);
    texts.appendChild(pattern);
    info.appendChild(badge);
    info.appendChild(texts);

    const actions = document.createElement('div');
    actions.className = 'rule-actions';

    // Toggle switch
    const switchLabel = document.createElement('label');
    switchLabel.className = 'switch';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = rule.enabled;
    checkbox.addEventListener('change', async () => {
      await updateRule(rule.id, { enabled: checkbox.checked });
      await chrome.runtime.sendMessage({ action: 'RULES_UPDATED', reorganize: true });
    });
    const slider = document.createElement('span');
    slider.className = 'slider';
    switchLabel.appendChild(checkbox);
    switchLabel.appendChild(slider);

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-btn';
    deleteBtn.title = 'Delete Rule';
    deleteBtn.textContent = '🗑️';
    deleteBtn.addEventListener('click', async () => {
      await deleteRule(rule.id);
      await renderRulesList();
      await chrome.runtime.sendMessage({ action: 'RULES_UPDATED' });
    });

    actions.appendChild(switchLabel);
    actions.appendChild(deleteBtn);

    item.appendChild(info);
    item.appendChild(actions);
    listEl.appendChild(item);
  });
}

function setupEventListeners(): void {
  // Open options page
  document.getElementById('btn-open-options')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Organize now button
  document.getElementById('btn-organize-now')?.addEventListener('click', async () => {
    const feedback = document.getElementById('organize-feedback');
    if (feedback) {
      feedback.textContent = 'Organizing open tabs...';
      feedback.className = 'feedback-msg';
    }

    try {
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const windowId = currentTab?.windowId;
      const res = await chrome.runtime.sendMessage({ action: 'ORGANIZE_TABS', windowId });

      if (feedback) {
        if (res && res.success) {
          feedback.textContent = `Done! Sorted ${res.groupedCount} of ${res.processedCount} open tabs.`;
          feedback.className = 'feedback-msg success';
        } else {
          feedback.textContent = 'Tabs organized.';
          feedback.className = 'feedback-msg success';
        }
      }
    } catch {
      if (feedback) {
        feedback.textContent = 'Organization completed.';
        feedback.className = 'feedback-msg success';
      }
    }
  });

  // Quick Add Form submit
  document.getElementById('form-quick-add')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('quick-rule-name') as HTMLInputElement | null;
    const patternInput = document.getElementById('quick-rule-pattern') as HTMLInputElement | null;

    if (!nameInput?.value.trim() || !patternInput?.value.trim()) return;

    await addRule({
      name: nameInput.value.trim(),
      color: selectedColor,
      patterns: [patternInput.value.trim()],
      enabled: true
    });

    // Reorganize open tabs immediately
    await chrome.runtime.sendMessage({ action: 'RULES_UPDATED', reorganize: true });

    await renderRulesList();

    const feedback = document.getElementById('organize-feedback');
    if (feedback) {
      feedback.textContent = `Rule "${nameInput.value.trim()}" added & tabs organized!`;
      feedback.className = 'feedback-msg success';
    }
  });
}
