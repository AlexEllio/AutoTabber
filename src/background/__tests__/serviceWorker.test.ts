import { afterEach, describe, expect, it, vi } from 'vitest';

type Listener = (...args: any[]) => unknown;

function createEvent() {
  const listeners: Listener[] = [];

  return {
    addListener(listener: Listener) {
      listeners.push(listener);
    },
    dispatch(...args: any[]) {
      listeners.forEach((listener) => listener(...args));
    }
  };
}

function createStorageArea(data: Record<string, unknown>) {
  return {
    get: vi.fn(async (keys: string[] | string) => {
      const requestedKeys = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(requestedKeys.map((key) => [key, data[key]]));
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(data, items);
    })
  };
}

function makeTab(id: number, url: string, groupId = -1, windowId = 1): chrome.tabs.Tab {
  return {
    id,
    url,
    groupId,
    windowId,
    pinned: false
  } as chrome.tabs.Tab;
}

async function settleAsyncListeners(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function loadServiceWorker(
  sessionData: Record<string, unknown> = {},
  initialGroups: chrome.tabGroups.TabGroup[] = []
) {
  const onCreated = createEvent();
  const onUpdated = createEvent();
  const onRemoved = createEvent();
  const onActivated = createEvent();
  const onMessage = createEvent();
  const onInstalled = createEvent();
  const onStartup = createEvent();
  const syncData: Record<string, unknown> = {
    rules: [
      {
        id: 'github',
        name: 'GitHub',
        color: 'purple',
        patterns: ['github.com*'],
        enabled: true,
        createdAt: 1,
        updatedAt: 1
      }
    ],
    settings: { autoCollapseInactive: false, retroactiveGroupingOnStartup: false }
  };
  const sync = createStorageArea(syncData);
  const session = createStorageArea(sessionData);
  const openTabs: chrome.tabs.Tab[] = [];
  const groups = initialGroups.map((group) => ({ ...group }));
  let nextGroupId = 100;
  const group = vi.fn(async (options: {
    tabIds: number | number[];
    groupId?: number;
    createProperties?: { windowId?: number };
  }) => {
    const tabIds = Array.isArray(options.tabIds) ? options.tabIds : [options.tabIds];
    let groupId = options.groupId;
    if (groupId === undefined) {
      groupId = nextGroupId++;
      const firstTab = openTabs.find((tab) => tab.id !== undefined && tabIds.includes(tab.id));
      groups.push({
        id: groupId,
        title: undefined,
        color: 'grey',
        collapsed: false,
        windowId: options.createProperties?.windowId ?? firstTab?.windowId ?? 1
      });
    }

    for (const tab of openTabs) {
      if (tab.id !== undefined && tabIds.includes(tab.id)) {
        tab.groupId = groupId;
      }
    }

    for (let index = groups.length - 1; index >= 0; index--) {
      if (!openTabs.some((tab) => tab.groupId === groups[index].id)) {
        groups.splice(index, 1);
      }
    }
    return groupId;
  });

  vi.stubGlobal('chrome', {
    tabs: {
      onCreated,
      onUpdated,
      onRemoved,
      onActivated,
      query: vi.fn(async (queryInfo: chrome.tabs.QueryInfo = {}) => openTabs.filter((tab) =>
        (queryInfo.groupId === undefined || tab.groupId === queryInfo.groupId) &&
        (queryInfo.windowId === undefined || tab.windowId === queryInfo.windowId)
      )),
      get: vi.fn(async () => makeTab(1, 'https://github.com/')),
      group
    },
    tabGroups: {
      TAB_GROUP_ID_NONE: -1,
      get: vi.fn(async (groupId: number) => {
        const foundGroup = groups.find((candidate) => candidate.id === groupId);
        if (!foundGroup) throw new Error('No current group');
        return foundGroup;
      }),
      query: vi.fn(async (queryInfo: chrome.tabGroups.QueryInfo = {}) => groups.filter((candidate) =>
        queryInfo.windowId === undefined || candidate.windowId === queryInfo.windowId
      )),
      update: vi.fn(async (groupId: number, updates: Partial<chrome.tabGroups.TabGroup>) => {
        const foundGroup = groups.find((candidate) => candidate.id === groupId);
        if (foundGroup) Object.assign(foundGroup, updates);
      })
    },
    storage: { sync, local: sync, session },
    runtime: {
      onMessage,
      onInstalled,
      onStartup,
      sendMessage: vi.fn()
    }
  });

  vi.resetModules();
  await import('../serviceWorker');

  return {
    events: { onCreated, onUpdated, onRemoved, onMessage },
    group,
    groups,
    openTabs,
    session
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('tab grouping opt-out', () => {
  it('keeps an opted-out tab ungrouped after navigation without excluding other tabs at the same URL', async () => {
    const worker = await loadServiceWorker();
    const optedOutTab = makeTab(1, 'https://github.com/first');

    worker.events.onUpdated.dispatch(1, { groupId: -1, status: 'complete' }, optedOutTab);
    await settleAsyncListeners();

    expect(worker.group).not.toHaveBeenCalled();
    worker.group.mockClear();
    worker.events.onUpdated.dispatch(
      1,
      { url: 'https://example.com/page', status: 'complete' },
      makeTab(1, 'https://example.com/page')
    );
    await settleAsyncListeners();
    worker.events.onUpdated.dispatch(
      1,
      { url: 'https://github.com/second', status: 'complete' },
      makeTab(1, 'https://github.com/second')
    );
    await settleAsyncListeners();

    expect(worker.group).not.toHaveBeenCalled();

    worker.events.onCreated.dispatch(makeTab(2, 'https://github.com/second'));
    await vi.waitFor(() => expect(worker.group).toHaveBeenCalledTimes(1));
    expect(worker.group).toHaveBeenCalledWith({
      tabIds: [2],
      createProperties: { windowId: 1 }
    });
  });

  describe('same-name Chrome tab-group merging', () => {
    it('consolidates all tabs into one matching group per window, then organizes new matching tabs', async () => {
      const worker = await loadServiceWorker({}, [
        { id: 10, title: 'GitHub', color: 'blue', collapsed: false, windowId: 1 },
        { id: 11, title: 'github', color: 'red', collapsed: false, windowId: 1 },
        { id: 20, title: 'GITHUB', color: 'green', collapsed: false, windowId: 2 }
      ]);
      worker.openTabs.push(
        makeTab(1, 'https://legacy.example/first', 10),
        makeTab(2, 'https://legacy.example/second', 11),
        makeTab(3, 'https://legacy.example/other-window', 20, 2),
        makeTab(4, 'https://github.com/new')
      );

      const mergeResponse = await new Promise<unknown>((resolve) => {
        worker.events.onMessage.dispatch(
          { action: 'MERGE_CHROME_TAB_GROUPS', name: 'GitHub', color: 'purple' },
          {},
          resolve
        );
      });

      expect(mergeResponse).toMatchObject({ success: true });
      expect(worker.groups.filter((group) => group.windowId === 1)).toEqual([
        { id: 10, title: 'GitHub', color: 'purple', collapsed: false, windowId: 1 }
      ]);
      expect(worker.groups.filter((group) => group.windowId === 2)).toEqual([
        { id: 20, title: 'GitHub', color: 'purple', collapsed: false, windowId: 2 }
      ]);
      expect(worker.openTabs.slice(0, 3).map((tab) => tab.groupId)).toEqual([10, 10, 20]);

      const organizeResponse = await new Promise<unknown>((resolve) => {
        worker.events.onMessage.dispatch(
          { action: 'RULES_UPDATED', reorganize: true },
          {},
          resolve
        );
      });

      expect(organizeResponse).toMatchObject({ success: true, groupedCount: 1 });
      expect(worker.openTabs[3].groupId).toBe(10);
      expect(worker.groups.filter((group) => group.title === 'GitHub')).toHaveLength(2);
    });
  });

  it('survives service-worker reinitialization during the same browser session', async () => {
    const sessionData: Record<string, unknown> = {};
    const firstWorker = await loadServiceWorker(sessionData);

    firstWorker.events.onUpdated.dispatch(
      1,
      { groupId: -1 },
      makeTab(1, 'https://github.com/first')
    );
    await settleAsyncListeners();

    const restartedWorker = await loadServiceWorker(sessionData);
    restartedWorker.events.onCreated.dispatch(makeTab(1, 'https://github.com/first'));
    await settleAsyncListeners();

    expect(restartedWorker.group).not.toHaveBeenCalled();
  });

  it('does not restore an opt-out in a new browser session', async () => {
    const firstSession = await loadServiceWorker();
    firstSession.events.onUpdated.dispatch(
      1,
      { groupId: -1 },
      makeTab(1, 'https://github.com/first')
    );
    await settleAsyncListeners();

    const newSession = await loadServiceWorker();
    newSession.events.onCreated.dispatch(makeTab(1, 'https://github.com/first'));

    await vi.waitFor(() => expect(newSession.group).toHaveBeenCalledTimes(1));
  });

  it('respects the opt-out during bulk organization and clears it after manually grouping the tab', async () => {
    const worker = await loadServiceWorker();
    const tab = makeTab(1, 'https://github.com/first');
    worker.openTabs.push(tab);

    worker.events.onUpdated.dispatch(1, { groupId: -1 }, tab);
    await settleAsyncListeners();
    worker.group.mockClear();

    const responsePromise = new Promise<unknown>((resolve) => {
      worker.events.onMessage.dispatch({ action: 'ORGANIZE_TABS' }, {}, resolve);
    });
    const response = await responsePromise;

    expect(worker.group).not.toHaveBeenCalled();
    expect(response).toMatchObject({ success: true, groupedCount: 0 });

    worker.events.onUpdated.dispatch(1, { groupId: 10 }, makeTab(1, tab.url!));
    await settleAsyncListeners();
    worker.events.onUpdated.dispatch(
      1,
      { url: 'https://github.com/second', status: 'complete' },
      makeTab(1, 'https://github.com/second')
    );

    await vi.waitFor(() => expect(worker.group).toHaveBeenCalledTimes(1));
    expect(worker.group).toHaveBeenCalledWith({
      tabIds: [1],
      createProperties: { windowId: 1 }
    });
  });

  it('clears the opt-out when Quick Add explicitly organizes the current tab', async () => {
    const worker = await loadServiceWorker();
    const tab = makeTab(1, 'https://github.com/first');
    worker.openTabs.push(tab);

    worker.events.onUpdated.dispatch(1, { groupId: -1 }, tab);
    await settleAsyncListeners();
    worker.group.mockClear();

    await new Promise<void>((resolve) => {
      worker.events.onMessage.dispatch(
        { action: 'RULES_UPDATED', reorganize: true, explicitTabId: tab.id },
        {},
        () => resolve()
      );
    });

    expect(worker.group).toHaveBeenCalledWith({
      tabIds: [1],
      createProperties: { windowId: 1 }
    });
  });
});
