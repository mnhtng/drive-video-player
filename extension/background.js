importScripts('drive-reference.js');

const {
  DEFAULT_PLAYER_BASE_URL,
  DRIVE_FILE_ID_PATTERN,
  buildPlayerUrl,
  parseDriveReference,
} = globalThis.NimbusDrive;

const MENU_OPEN_PAGE = 'nimbus-open-current-page';
const MENU_OPEN_LINK = 'nimbus-open-drive-link';

function storageGet(defaults) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(defaults, resolve);
  });
}

function createTab(url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url }, (tab) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(tab);
    });
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      resolve(response);
    });
  });
}

function normalizeReference(value) {
  const reference = typeof value === 'string'
    ? parseDriveReference(value)
    : value;

  if (!reference?.fileId || !DRIVE_FILE_ID_PATTERN.test(reference.fileId)) {
    return null;
  }

  return {
    fileId: reference.fileId,
    resourceKey: reference.resourceKey,
  };
}

async function openPlayer(referenceInput) {
  const reference = normalizeReference(referenceInput);
  if (!reference) {
    throw new Error('Missing a valid Google Drive file ID.');
  }

  const { playerBaseUrl } = await storageGet({ playerBaseUrl: DEFAULT_PLAYER_BASE_URL });
  const playerUrl = buildPlayerUrl(playerBaseUrl, reference.fileId, reference.resourceKey);
  await createTab(playerUrl);

  return playerUrl;
}

function installContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_OPEN_PAGE,
      title: 'Mở video Drive hiện tại trong Nimbus Player',
      contexts: ['page'],
      documentUrlPatterns: ['https://drive.google.com/*'],
    });

    chrome.contextMenus.create({
      id: MENU_OPEN_LINK,
      title: 'Mở video Drive trong Nimbus Player',
      contexts: ['link'],
      documentUrlPatterns: ['https://drive.google.com/*'],
      targetUrlPatterns: [
        'https://drive.google.com/*',
        'https://docs.google.com/*',
      ],
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get({ playerBaseUrl: null }, ({ playerBaseUrl }) => {
    if (!playerBaseUrl) {
      chrome.storage.sync.set({ playerBaseUrl: DEFAULT_PLAYER_BASE_URL });
    }
  });
  installContextMenus();
});

chrome.runtime.onStartup.addListener(installContextMenus);

async function handleContextMenuClick(info, tab) {
  const directReference = normalizeReference(info.linkUrl || info.srcUrl || info.pageUrl || tab?.url || '');

  if (directReference) {
    await openPlayer(directReference);
    return;
  }

  if (!tab?.id) return;

  const response = await sendTabMessage(tab.id, { type: 'GET_CURRENT_DRIVE_FILE' });
  if (response?.reference) {
    await openPlayer(response.reference);
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  handleContextMenuClick(info, tab).catch((error) => {
    console.warn('Nimbus Player không mở được file Drive đã chọn.', error);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'OPEN_IN_NIMBUS_PLAYER') {
    openPlayer(message)
      .then((url) => sendResponse({ ok: true, url }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});
