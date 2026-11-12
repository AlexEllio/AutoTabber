# AutoTabber - Smart Tab Groups for Chrome

AutoTabber is a Chrome extension (Manifest V3) that automatically organizes tabs into native Chrome Tab Groups based on URL domains, subdomains, and path prefixes.

---

## Key Features

- **Native Chrome Tab Groups**: Automatically creates and updates native Chrome Tab Groups with custom titles and colors.
- **Deep URL Matching**: Matches not just root domains, but subdomains and path prefixes (e.g. `atlassian.net/wiki*` for Confluence vs. `atlassian.net/jira*` for Jira).
- **Specificity-First Conflict Resolution**: If a URL matches multiple rules, the most specific pattern always wins (e.g. a deep path pattern takes precedence over a broad domain pattern).
- **Per-Window Isolation**: Groups are managed strictly within the active browser window.
- **Dynamic Re-Grouping**: Moves tabs into their matching group if you navigate between services, while preserving ungrouped status if navigating to an unconfigured site.
- **Respects Manual Overrides**: If you manually pull a tab out of a group, AutoTabber will leave it ungrouped until you navigate to a new URL.
- **Quick-Add Popup**: Detects your active tab's domain and path to suggest and create rules in one click.
- **Full Options & Rules Manager**: Reorder rule priority, customize Chrome tab group colors, and backup/restore rules via JSON.
- **Optional Inactive Auto-Collapse**: Keep your tab strip clean by automatically collapsing inactive groups when switching away.

---

## Installation (Developer Mode)

1. Clone or open this repository in your terminal.
2. Build the extension:
   ```bash
   npm install
   npm run build
   ```
3. Open Google Chrome and navigate to `chrome://extensions/`.
4. Turn on the **Developer mode** toggle in the top-right corner.
5. Click **Load unpacked** in the top-left corner.
6. Select the `dist` folder generated inside the repository directory.
7. AutoTabber will appear in your Chrome toolbar!

---

## Example Matching Rules

| Group Name | Color | Pattern | Matches |
|---|---|---|---|
| **Confluence** | `green` | `atlassian.net/wiki*` | `https://mycompany.atlassian.net/wiki/spaces/...` |
| **Jira** | `blue` | `atlassian.net/jira*` | `https://mycompany.atlassian.net/jira/your-work` |
| **Atlassian General** | `grey` | `atlassian.net*` | `https://mycompany.atlassian.net/admin` |
| **GitHub** | `purple` | `github.com*` | `https://github.com/my-org/my-repo` |

---

## Development & Testing

- **Run Tests**:
  ```bash
  npm test
  ```
- **Type Check**:
  ```bash
  npm run typecheck
  ```
- **Build Extension**:
  ```bash
  npm run build
  ```
- **Watch Mode**:
  ```bash
  npm run dev
  ```

---

## Tech Stack

- **Manifest**: Chrome Manifest V3
- **Language**: TypeScript
- **Bundler**: Vite
- **Test Runner**: Vitest
- **Storage**: `chrome.storage.sync` with `chrome.storage.local` fallback
- **Permissions**: `tabs`, `tabGroups`, `storage` (minimal, privacy-preserving)

---

## License

This project is licensed under the [MIT License](LICENSE).
