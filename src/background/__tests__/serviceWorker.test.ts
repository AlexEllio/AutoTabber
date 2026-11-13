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

function makeTab(id: number, url: string, groupId = -1): chrome.tabs.Tab {
  return {
    id,
    url,
    groupId,
    windowId: 1,
    pinned: false
  } as chrome.tabs.Tab;
}

async function settleAsyncListeners(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function loadServiceWorker(sessionData: Record<string, unknown> = {}) {
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
  const group = vi.fn(async () => 10);
  const openTabs: chrome.tabs.Tab[] = [];

  vi.stubGlobal('chrome', {
    tabs: {
      onCreated,
      onUpdated,
      onRemoved,
      onActivated,
      query: vi.fn(async () => openTabs),
      get: vi.fn(async () => makeTab(1, 'https://github.com/')),
      group
    },
    tabGroups: {
      TAB_GROUP_ID_NONE: -1,
      get: vi.fn(async () => {
        throw new Error('No current group');
      }),
      query: vi.fn(async () => []),
      update: vi.fn(async () => undefined)
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

    worker.events.onUpdated.dispatch(1, { groupId: -1 }, optedOutTab);
    await settleAsyncListeners();

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
