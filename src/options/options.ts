import {
  addRule,
  CHROME_GROUP_COLORS,
  DEFAULT_RULES,
  deleteRule,
  exportRulesJson,
  getStorageData,
  importRulesJson,
  saveRules,
  saveSettings,
  updateRule
} from '../common/storage';
import { ChromeGroupColor, TabRule } from '../common/types';

let modalSelectedColor: ChromeGroupColor = 'blue';

document.addEventListener('DOMContentLoaded', async () => {
  initModalColorPicker();
  await loadAndRenderRules();
  await loadAndRenderSettings();
  setupEventListeners();
});

function initModalColorPicker(): void {
  const container = document.getElementById('modal-color-picker');
  if (!container) return;

  container.innerHTML = '';
  CHROME_GROUP_COLORS.forEach((color) => {
    const dot = document.createElement('div');
    dot.className = `color-dot ${color === modalSelectedColor ? 'selected' : ''}`;
    dot.style.backgroundColor = `var(--color-${color})`;
    dot.title = color;
    dot.addEventListener('click', () => {
      modalSelectedColor = color;
      document.querySelectorAll('#modal-color-picker .color-dot').forEach((d) => d.classList.remove('selected'));
      dot.classList.add('selected');
    });
    container.appendChild(dot);
  });
}

function setModalColor(color: ChromeGroupColor): void {
  modalSelectedColor = color;
  document.querySelectorAll('#modal-color-picker .color-dot').forEach((d) => {
    if (d.getAttribute('title') === color) {
      d.classList.add('selected');
    } else {
      d.classList.remove('selected');
    }
  });
}

async function loadAndRenderSettings(): Promise<void> {
  const { settings } = await getStorageData();

  const autoCollapseCheckbox = document.getElementById('setting-auto-collapse') as HTMLInputElement | null;
  const startupCheckbox = document.getElementById('setting-startup-organize') as HTMLInputElement | null;

  if (autoCollapseCheckbox) {
    autoCollapseCheckbox.checked = settings.autoCollapseInactive;
    autoCollapseCheckbox.addEventListener('change', async () => {
      await saveSettings({
        ...settings,
        autoCollapseInactive: autoCollapseCheckbox.checked
      });
      showToast('Settings saved.');
    });
  }

  if (startupCheckbox) {
    startupCheckbox.checked = settings.retroactiveGroupingOnStartup;
    startupCheckbox.addEventListener('change', async () => {
      await saveSettings({
        ...settings,
        retroactiveGroupingOnStartup: startupCheckbox.checked
      });
      showToast('Settings saved.');
    });
  }
}

async function loadAndRenderRules(): Promise<void> {
  const listEl = document.getElementById('rules-manager-list');
  if (!listEl) return;

  const { rules } = await getStorageData();

  if (rules.length === 0) {
    listEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No rules defined yet. Click "+ Add New Rule" to create one.</div>';
    return;
  }

  listEl.innerHTML = '';
  rules.forEach((rule, index) => {
    const card = document.createElement('div');
    card.className = 'rule-card';

    // Left info
    const left = document.createElement('div');
    left.className = 'rule-card-left';

    const colorDot = document.createElement('div');
    colorDot.className = 'color-indicator';
    colorDot.style.backgroundColor = `var(--color-${rule.color})`;

    const details = document.createElement('div');
    details.className = 'rule-details';

    const title = document.createElement('div');
    title.className = 'rule-title';
    title.textContent = rule.name;

    const pills = document.createElement('div');
    pills.className = 'rule-pattern-pills';
    rule.patterns.forEach((p) => {
      const pill = document.createElement('span');
      pill.className = 'pattern-pill';
      pill.textContent = p;
      pills.appendChild(pill);
    });

    details.appendChild(title);
    details.appendChild(pills);
    left.appendChild(colorDot);
    left.appendChild(details);

    // Right actions
    const right = document.createElement('div');
    right.className = 'rule-card-right';

    // Move Up
    if (index > 0) {
      const upBtn = document.createElement('button');
      upBtn.className = 'icon-btn';
      upBtn.title = 'Move Up in Priority';
      upBtn.textContent = '▲';
      upBtn.addEventListener('click', async () => {
        const temp = rules[index - 1];
        rules[index - 1] = rules[index];
        rules[index] = temp;
        await saveRules(rules);
        await loadAndRenderRules();
        await notifyRulesUpdated();
      });
      right.appendChild(upBtn);
    }

    // Move Down
    if (index < rules.length - 1) {
      const downBtn = document.createElement('button');
      downBtn.className = 'icon-btn';
      downBtn.title = 'Move Down in Priority';
      downBtn.textContent = '▼';
      downBtn.addEventListener('click', async () => {
        const temp = rules[index + 1];
        rules[index + 1] = rules[index];
        rules[index] = temp;
        await saveRules(rules);
        await loadAndRenderRules();
        await notifyRulesUpdated();
      });
      right.appendChild(downBtn);
    }

    // Toggle switch
    const switchLabel = document.createElement('label');
    switchLabel.className = 'switch';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = rule.enabled;
    checkbox.addEventListener('change', async () => {
      await updateRule(rule.id, { enabled: checkbox.checked });
      await notifyRulesUpdated();
      showToast(`Rule "${rule.name}" ${checkbox.checked ? 'enabled' : 'disabled'}.`);
    });
    const slider = document.createElement('span');
    slider.className = 'slider';
    switchLabel.appendChild(checkbox);
    switchLabel.appendChild(slider);
    right.appendChild(switchLabel);

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn';
    editBtn.title = 'Edit Rule';
    editBtn.textContent = '✏️';
    editBtn.addEventListener('click', () => {
      openEditModal(rule);
    });
    right.appendChild(editBtn);

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-btn';
    deleteBtn.title = 'Delete Rule';
    deleteBtn.textContent = '🗑️';
    deleteBtn.addEventListener('click', async () => {
      if (confirm(`Are you sure you want to delete the rule "${rule.name}"?`)) {
        await deleteRule(rule.id);
        await loadAndRenderRules();
        await notifyRulesUpdated();
        showToast(`Rule "${rule.name}" deleted.`);
      }
    });
    right.appendChild(deleteBtn);

    card.appendChild(left);
    card.appendChild(right);
    listEl.appendChild(card);
  });
}

function openAddModal(): void {
  const modal = document.getElementById('rule-modal');
  const title = document.getElementById('modal-title');
  const idInput = document.getElementById('edit-rule-id') as HTMLInputElement;
  const nameInput = document.getElementById('rule-name-input') as HTMLInputElement;
  const patternsInput = document.getElementById('rule-patterns-input') as HTMLTextAreaElement;

  if (title) title.textContent = 'Add Tab Group Rule';
  if (idInput) idInput.value = '';
  if (nameInput) nameInput.value = '';
  if (patternsInput) patternsInput.value = '';
  setModalColor('blue');

  modal?.classList.remove('hidden');
}

function openEditModal(rule: TabRule): void {
  const modal = document.getElementById('rule-modal');
  const title = document.getElementById('modal-title');
  const idInput = document.getElementById('edit-rule-id') as HTMLInputElement;
  const nameInput = document.getElementById('rule-name-input') as HTMLInputElement;
  const patternsInput = document.getElementById('rule-patterns-input') as HTMLTextAreaElement;

  if (title) title.textContent = 'Edit Tab Group Rule';
  if (idInput) idInput.value = rule.id;
  if (nameInput) nameInput.value = rule.name;
  if (patternsInput) patternsInput.value = rule.patterns.join('\n');
  setModalColor(rule.color);

  modal?.classList.remove('hidden');
}

function closeModal(): void {
  document.getElementById('rule-modal')?.classList.add('hidden');
}

function setupEventListeners(): void {
  // Modal open / close
  document.getElementById('btn-add-rule-modal')?.addEventListener('click', openAddModal);
  document.getElementById('btn-close-modal')?.addEventListener('click', closeModal);
  document.getElementById('btn-cancel-modal')?.addEventListener('click', closeModal);

  // Form submit
  document.getElementById('form-rule-edit')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idInput = document.getElementById('edit-rule-id') as HTMLInputElement;
    const nameInput = document.getElementById('rule-name-input') as HTMLInputElement;
    const patternsInput = document.getElementById('rule-patterns-input') as HTMLTextAreaElement;

    const name = nameInput.value.trim();
    const rawPatterns = patternsInput.value;
    const patterns = rawPatterns
      .split(/[\n,]+/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (!name || patterns.length === 0) {
      alert('Please provide a group name and at least one URL pattern.');
      return;
    }

    if (idInput.value) {
      // Edit
      await updateRule(idInput.value, {
        name,
        color: modalSelectedColor,
        patterns
      });
      showToast(`Rule "${name}" updated.`);
    } else {
      // Add
      await addRule({
        name,
        color: modalSelectedColor,
        patterns,
        enabled: true
      });
      showToast(`Rule "${name}" created.`);
    }

    closeModal();
    await loadAndRenderRules();
    await notifyRulesUpdated();
  });

  // Export JSON
  document.getElementById('btn-export-json')?.addEventListener('click', async () => {
    const jsonStr = await exportRulesJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `autotabber-rules-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Rules exported successfully.');
  });

  // Import JSON trigger
  const importInput = document.getElementById('input-import-file') as HTMLInputElement;
  document.getElementById('btn-import-trigger')?.addEventListener('click', () => {
    importInput.click();
  });

  importInput?.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      const res = await importRulesJson(content);
      if (res.success) {
        showToast(`Imported ${res.count} rules successfully!`);
        await loadAndRenderRules();
        await loadAndRenderSettings();
        await notifyRulesUpdated();
      } else {
        alert('Import failed: ' + res.error);
      }
      importInput.value = '';
    };
    reader.readAsText(file);
  });

  // Reset to Defaults
  document.getElementById('btn-reset-defaults')?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to restore the default rules (Confluence, Jira, GitHub)? This will overwrite your current rules.')) {
      await saveRules(DEFAULT_RULES);
      await loadAndRenderRules();
      await notifyRulesUpdated();
      showToast('Default rules restored.');
    }
  });
}

async function notifyRulesUpdated(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ action: 'RULES_UPDATED', reorganize: true });
  } catch {
    // Service worker may be asleep, will load storage when woken
  }
}

function showToast(message: string): void {
  const toast = document.getElementById('toast-notification');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}
