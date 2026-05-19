(() => {
  const {
    DEFAULT_PLAYER_BASE_URL,
    normalizePlayerBaseUrl,
    parseDriveReference,
  } = globalThis.NimbusDrive;

  const tabStatus = document.getElementById('tabStatus');
  const fileName = document.getElementById('fileName');
  const openCurrentButton = document.getElementById('openCurrentButton');
  const openAppButton = document.getElementById('openAppButton');

  let currentReference = null;

  function storageGet(defaults) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(defaults, resolve);
    });
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }

        resolve(response);
      });
    });
  }

  function queryActiveTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs[0] || null);
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

  function createTab(url) {
    return new Promise((resolve) => {
      chrome.tabs.create({ url }, resolve);
    });
  }

  function renderCurrentReference(reference, tab) {
    currentReference = reference;

    if (!tab?.url?.startsWith('https://drive.google.com/')) {
      tabStatus.textContent = 'Mở một tab Google Drive để khởi chạy video.';
      fileName.hidden = true;
      openCurrentButton.disabled = true;
      return;
    }

    if (!reference?.fileId) {
      tabStatus.textContent = 'Chưa phát hiện video Drive trong tab này.';
      fileName.hidden = true;
      openCurrentButton.disabled = true;
      return;
    }

    tabStatus.textContent = reference.isLikelyVideo === false
      ? 'Đã phát hiện một file Drive.'
      : 'Sẵn sàng mở video Drive này.';
    fileName.textContent = reference.name || reference.fileId;
    fileName.hidden = false;
    openCurrentButton.disabled = false;
  }

  async function refreshCurrentTab() {
    tabStatus.textContent = 'Đang kiểm tra tab...';
    fileName.hidden = true;
    openCurrentButton.disabled = true;

    const tab = await queryActiveTab();
    let reference = tab?.url ? parseDriveReference(tab.url) : null;

    if (tab?.id) {
      const response = await sendTabMessage(tab.id, { type: 'GET_CURRENT_DRIVE_FILE' });
      if (response?.reference) {
        reference = response.reference;
      }
    }

    renderCurrentReference(reference, tab);
  }

  async function openReference(reference) {
    if (!reference?.fileId) return;

    openCurrentButton.disabled = true;
    const response = await sendRuntimeMessage({
      type: 'OPEN_IN_NIMBUS_PLAYER',
      fileId: reference.fileId,
      resourceKey: reference.resourceKey,
    });

    if (!response?.ok) {
      tabStatus.textContent = response?.error || 'Không mở được trình phát.';
      openCurrentButton.disabled = false;
    }
  }

  openCurrentButton.addEventListener('click', () => openReference(currentReference));
  openAppButton.addEventListener('click', async () => {
    const { playerBaseUrl } = await storageGet({ playerBaseUrl: DEFAULT_PLAYER_BASE_URL });
    await createTab(normalizePlayerBaseUrl(playerBaseUrl));
  });

  refreshCurrentTab();
})();
