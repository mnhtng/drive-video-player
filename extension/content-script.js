(() => {
  if (globalThis.__nimbusPlayerContentLoaded) return;
  globalThis.__nimbusPlayerContentLoaded = true;

  const {
    DEFAULT_PLAYER_BASE_URL,
    DRIVE_FILE_ID_PATTERN,
    buildPlayerUrl,
    hasVideoExtension,
    isDriveHost,
    parseDriveReference,
  } = globalThis.NimbusDrive;

  if (!isDriveHost(window.location.hostname)) return;

  const ROOT_ID = 'nimbus-player-extension-root';
  const SELECTED_ITEM_SELECTOR = [
    '[aria-selected="true"]',
    '[aria-checked="true"]',
    '[role="row"][aria-selected="true"]',
    '[role="gridcell"][aria-selected="true"]',
    '[role="option"][aria-selected="true"]',
    '[data-is-selected="true"]',
  ].join(',');
  const REFERENCE_ATTRIBUTE_NAMES = [
    'data-id',
    'data-docid',
    'data-file-id',
    'data-item-id',
    'data-resource-id',
    'data-target-id',
  ];
  const LABEL_ATTRIBUTE_NAMES = [
    'aria-label',
    'data-tooltip',
    'data-tooltip-unhoverable',
    'title',
    'alt',
  ];
  const VIDEO_FILE_NAME_CAPTURE_PATTERN = /^(.+\.(?:3g2|3gp|avi|flv|m2ts|m4v|mkv|mov|mp4|mpeg|mpg|mts|ogv|ts|webm|wmv))(?:$|[\s?#):;,]).*/i;

  let rootHost = null;
  let button = null;
  let fileLabel = null;
  let currentReference = null;
  let scanTimer = 0;
  let lastLocationHref = window.location.href;

  function createPlayIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('nimbus-icon');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M8 5.8v12.4c0 .7.8 1.1 1.4.7l9.2-6.2a.9.9 0 0 0 0-1.4L9.4 5.1C8.8 4.7 8 5.1 8 5.8z');
    path.setAttribute('fill', 'currentColor');

    svg.append(path);
    return svg;
  }

  function ensureUi() {
    if (rootHost?.isConnected) return;

    rootHost = document.getElementById(ROOT_ID);
    if (!rootHost) {
      rootHost = document.createElement('div');
      rootHost.id = ROOT_ID;
      document.documentElement.append(rootHost);
    }

    const shadow = rootHost.shadowRoot || rootHost.attachShadow({ mode: 'open' });
    shadow.textContent = '';

    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
      }

      .nimbus-shell {
        bottom: 24px;
        display: flex;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: none;
        position: fixed;
        right: 24px;
        z-index: 2147483647;
      }

      .nimbus-open-button {
        align-items: center;
        background: #0f172a;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 999px;
        box-shadow: 0 16px 40px rgba(15, 23, 42, 0.28), 0 2px 8px rgba(15, 23, 42, 0.2);
        color: #ffffff;
        cursor: pointer;
        display: flex;
        gap: 10px;
        min-height: 44px;
        max-width: min(360px, calc(100vw - 32px));
        padding: 8px 14px 8px 12px;
        pointer-events: auto;
        transition: background 140ms ease, box-shadow 140ms ease, transform 140ms ease;
      }

      .nimbus-open-button:hover {
        background: #111827;
        box-shadow: 0 18px 44px rgba(15, 23, 42, 0.32), 0 2px 10px rgba(15, 23, 42, 0.22);
        transform: translateY(-1px);
      }

      .nimbus-open-button:focus-visible {
        outline: 3px solid rgba(59, 130, 246, 0.45);
        outline-offset: 3px;
      }

      .nimbus-open-button:disabled {
        cursor: wait;
        opacity: 0.72;
      }

      .nimbus-icon {
        color: #60a5fa;
        flex: 0 0 auto;
        height: 20px;
        width: 20px;
      }

      .nimbus-copy {
        display: grid;
        min-width: 0;
      }

      .nimbus-title {
        font-size: 13px;
        font-weight: 700;
        line-height: 16px;
        white-space: nowrap;
      }

      .nimbus-file {
        color: #cbd5e1;
        font-size: 11px;
        font-weight: 500;
        line-height: 14px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      @media (max-width: 640px) {
        .nimbus-shell {
          bottom: 14px;
          right: 14px;
        }

        .nimbus-open-button {
          max-width: calc(100vw - 28px);
          min-height: 42px;
          padding: 8px 12px;
        }

        .nimbus-file {
          display: none;
        }
      }
    `;

    const shell = document.createElement('div');
    shell.className = 'nimbus-shell';

    button = document.createElement('button');
    button.type = 'button';
    button.className = 'nimbus-open-button';
    button.setAttribute('aria-label', 'Mở trong Nimbus Player');
    button.addEventListener('click', openCurrentReference);

    const copy = document.createElement('span');
    copy.className = 'nimbus-copy';

    const title = document.createElement('span');
    title.className = 'nimbus-title';
    title.textContent = 'Mở video này';

    fileLabel = document.createElement('span');
    fileLabel.className = 'nimbus-file';

    copy.append(title, fileLabel);
    button.append(createPlayIcon(), copy);
    shell.append(button);
    shadow.append(style, shell);
  }

  function getCandidateLabel(element) {
    if (!element) return '';

    for (const attributeName of LABEL_ATTRIBUTE_NAMES) {
      const value = element.getAttribute?.(attributeName);
      const cleanedValue = cleanCandidateLabel(value);
      if (cleanedValue) return cleanedValue;
    }

    const labelledBy = element.getAttribute?.('aria-labelledby');
    if (labelledBy) {
      const label = labelledBy
        .split(/\s+/)
        .map((id) => cleanCandidateLabel(document.getElementById(id)?.textContent))
        .filter(Boolean)
        .join(' ');
      if (label) return label;
    }

    const text = cleanCandidateLabel(element.textContent);
    if (text && text.length <= 160) return text;

    return '';
  }

  function cleanCandidateLabel(value) {
    if (!value || typeof value !== 'string') return '';

    const normalized = value
      .replace(/\s+/g, ' ')
      .replace(/\s+-\s+Google Drive\s*$/i, '')
      .trim();

    if (!normalized) return '';

    const fileNameMatch = normalized.match(VIDEO_FILE_NAME_CAPTURE_PATTERN);
    if (fileNameMatch) return fileNameMatch[1].trim();

    return normalized
      .replace(/\s+Video\s+More info\s+\([^)]+\)\s*$/i, '')
      .replace(/\s+More info\s+\([^)]+\)\s*$/i, '')
      .replace(/\s+Video\s+More info\s*$/i, '')
      .replace(/\s+More info\s*$/i, '')
      .trim();
  }

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function referenceFromAttributes(element) {
    if (!element) return null;

    for (const attributeName of REFERENCE_ATTRIBUTE_NAMES) {
      const value = element.getAttribute?.(attributeName);
      if (value && DRIVE_FILE_ID_PATTERN.test(value)) {
        return { fileId: value };
      }
    }

    return null;
  }

  function referenceFromElement(element) {
    if (!element) return null;

    if (element instanceof HTMLAnchorElement) {
      const directReference = parseDriveReference(element.href);
      if (directReference) return directReference;
    }

    const attributeReference = referenceFromAttributes(element);
    if (attributeReference) return attributeReference;

    const links = Array.from(element.querySelectorAll('a[href]'));
    for (const link of links) {
      const reference = parseDriveReference(link.href);
      if (reference) return reference;
    }

    const attributeCandidates = Array.from(element.querySelectorAll(REFERENCE_ATTRIBUTE_NAMES.map((name) => `[${name}]`).join(',')));
    for (const candidate of attributeCandidates) {
      const reference = referenceFromAttributes(candidate);
      if (reference) return reference;
    }

    return null;
  }

  function enrichReference(reference, sourceElement, source) {
    if (!reference) return null;

    const name = getCandidateLabel(sourceElement)
      || cleanCandidateLabel(document.title)
      || '';
    const isLikelyVideo = hasVideoExtension(name)
      || hasVideoExtension(document.title)
      || Boolean(document.querySelector('video'));

    return {
      ...reference,
      name,
      source,
      isLikelyVideo,
    };
  }

  function findLocationReference() {
    const reference = parseDriveReference(window.location.href);
    if (!reference) return null;
    return enrichReference(reference, null, 'location');
  }

  function findSelectedReference() {
    const selectedElements = Array.from(document.querySelectorAll(SELECTED_ITEM_SELECTOR))
      .filter(isVisible)
      .slice(0, 12);

    for (const selectedElement of selectedElements) {
      const searchRoot = selectedElement.closest('[role="row"], [role="gridcell"], [role="option"], [data-id], [data-docid]')
        || selectedElement;
      const reference = referenceFromElement(searchRoot);
      if (!reference) continue;

      return enrichReference(reference, searchRoot, 'selection');
    }

    return null;
  }

  function findCurrentReference() {
    const locationReference = findLocationReference();
    if (locationReference?.isLikelyVideo) return locationReference;

    const selectedReference = findSelectedReference();
    if (selectedReference?.isLikelyVideo) return selectedReference;

    return locationReference || selectedReference || null;
  }

  function render(reference) {
    ensureUi();

    currentReference = reference;
    const shouldShow = Boolean(reference?.fileId && reference.isLikelyVideo);
    rootHost.style.display = shouldShow ? '' : 'none';

    if (!shouldShow) return;

    const name = reference.name || reference.fileId;
    fileLabel.textContent = name;
    button.title = `Mở ${name} trong Nimbus Player`;
    button.setAttribute('aria-label', `Mở ${name} trong Nimbus Player`);
    button.disabled = false;
  }

  function scan() {
    render(findCurrentReference());
  }

  function scheduleScan(delay = 180) {
    if (scanTimer) return;
    scanTimer = window.setTimeout(() => {
      scanTimer = 0;
      scan();
    }, delay);
  }

  function openCurrentReference() {
    if (!currentReference?.fileId) return;

    button.disabled = true;
    chrome.runtime.sendMessage({
      type: 'OPEN_IN_NIMBUS_PLAYER',
      fileId: currentReference.fileId,
      resourceKey: currentReference.resourceKey,
    }, (response) => {
      button.disabled = false;

      if (chrome.runtime.lastError || !response?.ok) {
        openWithStoredPlayerUrl(currentReference);
      }
    });
  }

  function openWithStoredPlayerUrl(reference) {
    chrome.storage.sync.get({ playerBaseUrl: DEFAULT_PLAYER_BASE_URL }, (items) => {
      const url = buildPlayerUrl(items.playerBaseUrl, reference.fileId, reference.resourceKey);
      window.open(url, '_blank', 'noopener');
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'GET_CURRENT_DRIVE_FILE') return false;

    scan();
    sendResponse({
      reference: currentReference?.fileId ? {
        fileId: currentReference.fileId,
        resourceKey: currentReference.resourceKey,
        name: currentReference.name,
        isLikelyVideo: currentReference.isLikelyVideo,
      } : null,
    });
    return false;
  });

  const observer = new MutationObserver(() => scheduleScan());

  function start() {
    ensureUi();
    scan();

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['aria-selected', 'aria-checked', 'data-is-selected', 'title', 'aria-label'],
      childList: true,
      subtree: true,
    });

    window.setInterval(() => {
      if (lastLocationHref === window.location.href) return;
      lastLocationHref = window.location.href;
      scheduleScan(0);
    }, 750);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
