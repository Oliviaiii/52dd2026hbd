import {
  buildPrizeIndex,
  checkSerial,
  historyToCsv,
  mergeHistory,
  parseSerials,
  parseWinnerSheetCsv,
  removeHistoryCode,
  validatePrizeData,
} from "./core.js";

const STORAGE_KEY = "birthday-scratch-checker-history-v1";
const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js";

const state = {
  config: null,
  prizeData: null,
  prizeIndex: new Map(),
  galleryData: { items: [] },
  catalogData: { groups: [] },
  prizeSource: { type: "local", error: null },
  history: [],
  activeTab: "manual",
  catalogExpanded: false,
  lastCheckedCodes: [],
  refreshTimer: null,
  photoFile: null,
  photoUrl: null,
};

const elements = {};

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  collectElements();
  bindEvents();
  state.history = loadHistory();

  try {
    const configResponse = await fetch("data/config.json", { cache: "no-cache" });
    if (!configResponse.ok) throw new Error("無法讀取活動設定");
    state.config = await configResponse.json();

    const [prizeResult, galleryResponse, catalogResponse] = await Promise.all([
      loadPrizeData(state.config),
      fetch("data/gallery.json", { cache: "no-cache" }),
      fetch("data/prize-catalog.json", { cache: "no-cache" }),
    ]);

    state.prizeData = prizeResult.data;
    state.prizeSource = { type: prizeResult.type, error: prizeResult.error ?? null };
    state.galleryData = galleryResponse.ok ? await galleryResponse.json() : { items: [] };
    state.catalogData = catalogResponse.ok ? await catalogResponse.json() : { groups: [] };
    state.prizeIndex = buildPrizeIndex(state.prizeData.prizes);
    applyEventContent();
    renderGallery();
    renderCatalog();
    renderHistory();
    updateInputSummary();
    configurePrizeRefresh();
    window.__birthdayAppReady = true;
  } catch (error) {
    console.error(error);
    setEventStatus("資料讀取失敗", "error");
    renderLoadError();
    showMessage("活動資料暫時無法讀取，請重新整理頁面後再試一次。");
    elements.checkButton.disabled = true;
    window.__birthdayAppReady = true;
  }

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("service-worker.js").catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
  }
}

async function loadPrizeData(config) {
  const localResponse = await fetch("data/prizes.json", { cache: "no-cache" });
  if (!localResponse.ok) throw new Error("無法讀取網站備份中獎名單");
  const localData = await localResponse.json();
  validatePrizeData(localData, config.serial);

  const sheetUrl = String(config.winnerSource?.url ?? "").trim();
  if (!sheetUrl) return { data: localData, type: "local" };

  try {
    const url = new URL(sheetUrl, window.location.href);
    url.searchParams.set("_updated", String(Date.now()));
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Google Sheet 回應 ${response.status}`);
    const data = parseWinnerSheetCsv(await response.text(), config.serial);
    return { data, type: "google-sheets" };
  } catch (error) {
    console.info("Google Sheet winner source unavailable; using local fallback.", error);
    return { data: localData, type: "fallback", error };
  }
}

function renderLoadError() {
  elements.galleryCount.textContent = "獎項資料載入失敗";
  const galleryError = document.createElement("div");
  galleryError.className = "gallery-empty gallery-empty--notice";
  galleryError.innerHTML = "<strong>目前無法載入獎項</strong><span>請確認網路連線後重新整理；若是本機預覽，請使用 <code>npm start</code>。</span>";
  elements.prizeGallery.replaceChildren(galleryError);
  elements.catalogSummary.textContent = "無法載入獎品文字清單";
  elements.prizeCatalog.replaceChildren();
}

function collectElements() {
  const ids = [
    "brand-name",
    "event-description",
    "event-status",
    "updated-at",
    "footer-name",
    "gallery-count",
    "gallery-prev",
    "gallery-next",
    "prize-gallery",
    "catalog-summary",
    "catalog-search",
    "prize-catalog",
    "catalog-toggle",
    "official-source",
    "winner-sync-status",
    "refresh-prizes",
    "image-dialog",
    "image-dialog-title",
    "image-dialog-crop",
    "image-dialog-photo",
    "close-image-dialog",
    "panel-manual",
    "panel-photo",
    "serial-input",
    "input-summary",
    "photo-empty",
    "photo-input",
    "photo-preview-wrap",
    "photo-preview",
    "recognize-photo",
    "replace-photo",
    "ocr-progress-wrap",
    "ocr-progress-bar",
    "ocr-progress-text",
    "ocr-review",
    "ocr-text",
    "form-message",
    "check-button",
    "results-section",
    "result-summary",
    "results-list",
    "history-empty",
    "history-content",
    "history-count",
    "history-list",
    "export-history",
    "clear-history",
  ];

  for (const id of ids) {
    elements[toCamelCase(id)] = document.getElementById(id);
  }
  elements.tabs = [...document.querySelectorAll("[data-tab]")];
}

function bindEvents() {
  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    tab.addEventListener("keydown", handleTabKeydown);
  });
  elements.serialInput.addEventListener("input", updateInputSummary);
  elements.photoInput.addEventListener("change", selectPhoto);
  elements.replacePhoto.addEventListener("click", () => elements.photoInput.click());
  elements.recognizePhoto.addEventListener("click", recognizePhoto);
  elements.checkButton.addEventListener("click", checkCurrentInput);
  elements.exportHistory.addEventListener("click", exportHistory);
  elements.clearHistory.addEventListener("click", clearHistory);
  elements.galleryPrev.addEventListener("click", () => scrollGallery(-1));
  elements.galleryNext.addEventListener("click", () => scrollGallery(1));
  elements.closeImageDialog.addEventListener("click", () => elements.imageDialog.close());
  elements.imageDialog.addEventListener("click", closeDialogFromBackdrop);
  elements.catalogSearch.addEventListener("input", () => renderCatalog(elements.catalogSearch.value));
  elements.catalogToggle.addEventListener("click", toggleCatalog);
  elements.refreshPrizes.addEventListener("click", () => refreshPrizeData());
}

function applyEventContent() {
  const event = state.config.event ?? {};
  const siteName = event.siteName || "生日刮刮卡中獎查詢";
  document.title = `${siteName}｜中獎序號查詢`;
  elements.brandName.textContent = event.brandName || "生日刮刮卡";
  elements.footerName.textContent = siteName;
  elements.eventDescription.textContent =
    event.description || "輸入、貼上或拍下刮刮卡序號，我們幫你一次完成比對。";

  renderOfficialSource(event.officialSource);

  const announced = state.prizeData.status === "announced";
  setEventStatus(announced ? "中獎名單已公布" : "等待中獎名單公布", announced ? "ready" : "pending");

  if (state.prizeData.updatedAt) {
    elements.updatedAt.textContent = `名單更新：${formatDate(state.prizeData.updatedAt)}`;
  } else {
    elements.updatedAt.textContent = "";
  }
  updateWinnerSyncStatus();
}

function renderOfficialSource(source = {}) {
  const label = source.label || "活動主辦單位公開內容整理";
  elements.officialSource.replaceChildren(document.createTextNode("資料來源："));
  if (source.url) {
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    elements.officialSource.append(link);
  } else {
    elements.officialSource.append(document.createTextNode(label));
  }
}

function updateWinnerSyncStatus() {
  const sheetConfigured = Boolean(String(state.config?.winnerSource?.url ?? "").trim());
  const announced = state.prizeData?.status === "announced";
  const updatedText = state.prizeData?.updatedAt
    ? `，更新於 ${formatDate(state.prizeData.updatedAt, true)}`
    : "";

  elements.refreshPrizes.hidden = !sheetConfigured;
  if (state.prizeSource.type === "fallback") {
    elements.winnerSyncStatus.textContent = "Google Sheet 暫時無法更新，現正使用網站備份名單";
  } else if (state.prizeSource.type === "google-sheets") {
    elements.winnerSyncStatus.textContent = announced
      ? `Google Sheet 中獎名單已同步${updatedText}`
      : "Google Sheet 已連線，中獎名單尚未公布";
  } else {
    elements.winnerSyncStatus.textContent = announced
      ? `網站中獎名單已更新${updatedText}`
      : "中獎名單尚未公布";
  }
}

function configurePrizeRefresh() {
  const sheetConfigured = Boolean(String(state.config?.winnerSource?.url ?? "").trim());
  if (!sheetConfigured) return;
  const refreshSeconds = Math.max(30, Number(state.config.winnerSource.refreshSeconds) || 60);
  window.clearInterval(state.refreshTimer);
  state.refreshTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") refreshPrizeData({ silent: true });
  }, refreshSeconds * 1000);
}

async function refreshPrizeData({ silent = false } = {}) {
  if (!state.config || elements.refreshPrizes.disabled) return;
  elements.refreshPrizes.disabled = true;
  if (!silent) elements.refreshPrizes.textContent = "更新中…";

  try {
    const prizeResult = await loadPrizeData(state.config);
    state.prizeData = prizeResult.data;
    state.prizeSource = { type: prizeResult.type, error: prizeResult.error ?? null };
    state.prizeIndex = buildPrizeIndex(state.prizeData.prizes);
    applyEventContent();
    renderHistory();
    if (state.lastCheckedCodes.length) {
      renderResults(state.lastCheckedCodes.map(resultForCode));
    }
  } catch (error) {
    console.error(error);
    state.prizeSource = { type: "fallback", error };
    updateWinnerSyncStatus();
  } finally {
    elements.refreshPrizes.disabled = false;
    elements.refreshPrizes.textContent = "更新中獎名單";
  }
}

function setEventStatus(text, variant) {
  elements.eventStatus.textContent = text;
  elements.eventStatus.className = `status-pill status-pill--${variant}`;
}

function renderGallery() {
  const items = Array.isArray(state.galleryData.items) ? state.galleryData.items : [];
  elements.prizeGallery.replaceChildren();
  elements.galleryCount.textContent = items.length
    ? `目前共 ${items.length} 張獎項總覽・獎項持續追加`
    : "獎項圖片整理中";
  elements.galleryPrev.disabled = !items.length;
  elements.galleryNext.disabled = !items.length;

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "gallery-empty";
    empty.textContent = "獎項圖片整理中，請稍後再回來看看。";
    elements.prizeGallery.append(empty);
    return;
  }

  items.forEach((item, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "prize-gallery__card";
    card.setAttribute("aria-label", `放大查看${item.title || `獎項總覽 ${index + 1}`}`);
    card.addEventListener("click", () => openGalleryImage(item));

    const imageWrap = document.createElement("span");
    imageWrap.className = "prize-gallery__image";
    const image = document.createElement("img");
    image.src = item.src;
    image.alt = item.alt || item.title || `獎項總覽 ${index + 1}`;
    image.loading = index < 2 ? "eager" : "lazy";
    image.decoding = "async";
    applyImageCrop(imageWrap, image, item.crop);
    imageWrap.append(image);

    const caption = document.createElement("span");
    caption.className = "prize-gallery__caption";
    const title = document.createElement("strong");
    title.textContent = item.title || `獎項總覽 ${index + 1}`;
    const counter = document.createElement("span");
    counter.textContent = `${String(index + 1).padStart(2, "0")} / ${String(items.length).padStart(2, "0")}`;
    caption.append(title, counter);
    card.append(imageWrap, caption);
    elements.prizeGallery.append(card);
  });
}

function scrollGallery(direction) {
  elements.prizeGallery.scrollBy({
    left: direction * elements.prizeGallery.clientWidth * 0.82,
    behavior: "smooth",
  });
}

function openGalleryImage(item) {
  elements.imageDialogTitle.textContent = item.title || "獎項總覽";
  elements.imageDialogPhoto.src = item.src;
  elements.imageDialogPhoto.alt = item.alt || item.title || "生日慶獎項總覽";
  applyImageCrop(elements.imageDialogCrop, elements.imageDialogPhoto, item.crop);

  if (typeof elements.imageDialog.showModal === "function") {
    elements.imageDialog.showModal();
  } else {
    window.open(item.src, "_blank", "noopener,noreferrer");
  }
}

function closeDialogFromBackdrop(event) {
  if (event.target === elements.imageDialog) elements.imageDialog.close();
}

function applyImageCrop(container, image, crop) {
  if (!crop) return;
  const cropHeight = Number(crop.bottom) - Number(crop.top);
  if (cropHeight <= 0 || !crop.width || !crop.height) return;

  container.style.aspectRatio = `${crop.width} / ${cropHeight}`;
  image.style.top = `${(-Number(crop.top) / cropHeight) * 100}%`;
  image.style.height = "auto";
  image.style.objectFit = "initial";
  image.style.objectPosition = "initial";
}

function renderCatalog(query = "") {
  const previewCount = 20;
  const groups = Array.isArray(state.catalogData.groups) ? state.catalogData.groups : [];
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-Hant-TW");
  const allItems = groups.flatMap((group) =>
    (group.items || []).map((item) => ({ ...item, page: group.page })),
  );
  const matchedItems = normalizedQuery
    ? allItems.filter((item) => item.name.toLocaleLowerCase("zh-Hant-TW").includes(normalizedQuery))
    : allItems;
  const totalQuantity = matchedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const shouldLimit = !normalizedQuery && !state.catalogExpanded && matchedItems.length > previewCount;
  const visibleItems = shouldLimit ? matchedItems.slice(0, previewCount) : matchedItems;

  elements.catalogSummary.textContent = normalizedQuery
    ? `找到 ${matchedItems.length} 款、合計 ${totalQuantity.toLocaleString("zh-TW")} 個名額`
    : `目前整理 ${allItems.length} 款、合計 ${totalQuantity.toLocaleString("zh-TW")} 個名額${shouldLimit ? `・先顯示 ${previewCount} 款` : ""}`;
  elements.prizeCatalog.replaceChildren();
  elements.catalogToggle.hidden = Boolean(normalizedQuery) || matchedItems.length <= previewCount;
  elements.catalogToggle.setAttribute("aria-expanded", String(state.catalogExpanded));
  elements.catalogToggle.textContent = state.catalogExpanded
    ? "收合獎品清單"
    : `展開完整清單（${matchedItems.length} 款）`;

  if (!matchedItems.length) {
    const empty = document.createElement("p");
    empty.className = "catalog-empty";
    empty.textContent = "找不到符合的獎品，請換一個關鍵字。";
    elements.prizeCatalog.append(empty);
    return;
  }

  const list = document.createElement("ul");
  list.className = "catalog-list";
  for (const item of visibleItems) {
    const listItem = document.createElement("li");
    const badge = document.createElement("span");
    badge.className = "catalog-quantity";
    badge.textContent = `${item.quantity} 名`;
    const name = document.createElement("span");
    name.textContent = item.name;
    listItem.append(badge, name);
    list.append(listItem);
  }
  elements.prizeCatalog.append(list);
}

function toggleCatalog() {
  state.catalogExpanded = !state.catalogExpanded;
  renderCatalog(elements.catalogSearch.value);
  if (!state.catalogExpanded) {
    elements.catalogSummary.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function switchTab(tabName, focusTab = false) {
  state.activeTab = tabName;
  const isManual = tabName === "manual";
  elements.panelManual.hidden = !isManual;
  elements.panelPhoto.hidden = isManual;
  elements.tabs.forEach((tab) => {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && focusTab) tab.focus();
  });
  hideMessage();
}

function handleTabKeydown(event) {
  const currentIndex = elements.tabs.indexOf(event.currentTarget);
  let nextIndex = currentIndex;
  if (["ArrowRight", "ArrowDown"].includes(event.key)) nextIndex = (currentIndex + 1) % elements.tabs.length;
  if (["ArrowLeft", "ArrowUp"].includes(event.key)) nextIndex = (currentIndex - 1 + elements.tabs.length) % elements.tabs.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = elements.tabs.length - 1;
  if (nextIndex === currentIndex) return;
  event.preventDefault();
  switchTab(elements.tabs[nextIndex].dataset.tab, true);
}

function updateInputSummary() {
  if (!state.config) return;
  const parsed = parseSerials(elements.serialInput.value, state.config.serial);
  if (!elements.serialInput.value.trim()) {
    elements.inputSummary.textContent = "尚未輸入序號";
    return;
  }

  const invalidText = parsed.invalid.length ? `，${parsed.invalid.length} 組格式待確認` : "";
  elements.inputSummary.textContent = `偵測到 ${parsed.valid.length} 組有效序號${invalidText}`;
}

function selectPhoto(event) {
  const [file] = event.target.files;
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showMessage("請選擇 JPG、PNG、HEIC 等圖片檔案。");
    return;
  }

  if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
  state.photoFile = file;
  state.photoUrl = URL.createObjectURL(file);
  elements.photoPreview.src = state.photoUrl;
  elements.photoEmpty.hidden = true;
  elements.photoPreviewWrap.hidden = false;
  elements.ocrReview.hidden = true;
  elements.ocrProgressWrap.hidden = true;
  elements.ocrText.value = "";
  hideMessage();
}

async function recognizePhoto() {
  if (!state.photoFile) {
    showMessage("請先選擇一張照片。");
    return;
  }

  elements.recognizePhoto.disabled = true;
  elements.ocrProgressWrap.hidden = false;
  updateOcrProgress(0, "正在載入辨識引擎，第一次使用需要一些時間…");
  hideMessage();
  let worker;

  try {
    await ensureTesseract();
    const ocrConfig = state.config.ocr ?? {};
    worker = await window.Tesseract.createWorker(ocrConfig.language || "eng", undefined, {
      logger: handleOcrLog,
    });
    await worker.setParameters({
      tessedit_char_whitelist: ocrConfig.characterWhitelist || "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-",
      preserve_interword_spaces: "1",
    });

    const result = await worker.recognize(state.photoFile);
    const parsed = parseSerials(result.data.text, state.config.serial);
    elements.ocrText.value = parsed.valid.length ? parsed.valid.join("\n") : result.data.text.trim();
    elements.ocrReview.hidden = false;
    updateOcrProgress(1, "辨識完成，請核對下方序號。");
    elements.ocrText.focus();
  } catch (error) {
    console.error(error);
    showMessage("圖片辨識沒有成功。請檢查網路連線，或改用手動輸入序號。");
    updateOcrProgress(0, "辨識失敗");
  } finally {
    if (worker) await worker.terminate();
    elements.recognizePhoto.disabled = false;
  }
}

function ensureTesseract() {
  if (window.Tesseract) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${TESSERACT_URL}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = TESSERACT_URL;
    script.crossOrigin = "anonymous";
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", reject, { once: true });
    document.head.append(script);
  });
}

function handleOcrLog(message) {
  const statusMap = {
    "loading tesseract core": "正在載入辨識核心…",
    "initializing tesseract": "正在初始化辨識引擎…",
    "loading language traineddata": "正在載入文字模型…",
    "initializing api": "正在準備辨識…",
    "recognizing text": "正在辨識照片中的序號…",
  };
  updateOcrProgress(message.progress ?? 0, statusMap[message.status] || "正在處理照片…");
}

function updateOcrProgress(progress, message) {
  const percentage = Math.max(0, Math.min(100, Math.round(progress * 100)));
  elements.ocrProgressBar.style.width = `${percentage}%`;
  elements.ocrProgressText.textContent = percentage > 0 ? `${message} ${percentage}%` : message;
}

function checkCurrentInput() {
  if (!state.config || !state.prizeData) return;
  const source = state.activeTab === "manual" ? elements.serialInput.value : elements.ocrText.value;
  const parsed = parseSerials(source, state.config.serial);

  if (!parsed.valid.length) {
    showMessage(getInvalidInputMessage(parsed));
    return;
  }

  hideMessage();
  state.lastCheckedCodes = parsed.valid;
  const results = parsed.valid.map(resultForCode);
  renderResults(results);

  const checkedAt = new Date().toISOString();
  state.history = mergeHistory(
    state.history,
    parsed.valid,
    checkedAt,
    state.config.storage?.maxHistoryItems ?? 1000,
  );
  saveHistory();
  renderHistory();

  if (parsed.invalid.length) {
    showMessage(`已略過 ${parsed.invalid.length} 組格式不符的內容，請確認序號是否完整。`);
  }

  elements.resultsSection.hidden = false;
  elements.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getInvalidInputMessage(parsed) {
  if (!parsed.totalChunks) return "請先輸入至少一組序號。";
  const serial = state.config.serial;
  return `目前沒有可查詢的序號。請確認序號為 ${serial.minLength}～${serial.maxLength} 碼，並只包含英文字母、數字或連字號。`;
}

function resultForCode(code) {
  return checkSerial(code, state.prizeData, state.prizeIndex);
}

function renderResults(results) {
  elements.resultsList.replaceChildren();
  const winners = results.filter((result) => result.state === "winner").length;
  const pending = results.filter((result) => result.state === "pending").length;

  elements.resultSummary.replaceChildren(
    createSummaryChip(`共 ${results.length} 組`),
    createSummaryChip(pending ? `${pending} 組待公布` : `${winners} 組中獎`, winners ? "winner" : ""),
  );

  for (const result of results) {
    const card = document.createElement("article");
    card.className = `result-card result-card--${result.state}`;

    const icon = document.createElement("span");
    icon.className = "result-card__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = result.state === "winner" ? "✓" : result.state === "pending" ? "…" : "—";

    const body = document.createElement("div");
    body.className = "result-card__body";
    const code = document.createElement("p");
    code.className = "result-card__code";
    code.textContent = result.code;
    const status = document.createElement("p");
    status.className = "result-card__status";
    status.textContent = result.label;
    body.append(code, status);
    card.append(icon, body);
    elements.resultsList.append(card);
  }
}

function createSummaryChip(text, modifier = "") {
  const chip = document.createElement("span");
  chip.className = `summary-chip${modifier ? ` summary-chip--${modifier}` : ""}`;
  chip.textContent = text;
  return chip;
}

function renderHistory() {
  const hasHistory = state.history.length > 0;
  elements.historyEmpty.hidden = hasHistory;
  elements.historyContent.hidden = !hasHistory;
  if (!hasHistory || !state.prizeData) return;

  elements.historyCount.textContent = `已記錄 ${state.history.length} 組序號`;
  elements.historyList.replaceChildren();

  for (const entry of state.history) {
    const result = resultForCode(entry.code);
    const row = document.createElement("tr");
    const codeCell = document.createElement("td");
    codeCell.textContent = entry.code;
    const statusCell = document.createElement("td");
    const status = document.createElement("span");
    status.className = `table-status table-status--${result.state}`;
    status.textContent = result.label;
    statusCell.append(status);
    const timeCell = document.createElement("td");
    timeCell.textContent = formatDate(entry.checkedAt, true);
    const actionCell = document.createElement("td");
    const deleteButton = document.createElement("button");
    deleteButton.className = "history-delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "刪除";
    deleteButton.setAttribute("aria-label", `刪除序號 ${entry.code}`);
    deleteButton.addEventListener("click", () => deleteHistoryCode(entry.code));
    actionCell.append(deleteButton);
    row.append(codeCell, statusCell, timeCell, actionCell);
    elements.historyList.append(row);
  }
}

function loadHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.history));
  } catch (error) {
    console.warn("Unable to save history:", error);
    showMessage("瀏覽器無法儲存查詢紀錄，但本次查詢結果仍可正常查看。");
  }
}

function clearHistory() {
  if (!window.confirm("確定要清除這台裝置上的所有查詢紀錄嗎？")) return;
  state.history = [];
  localStorage.removeItem(STORAGE_KEY);
  renderHistory();
}

function deleteHistoryCode(code) {
  state.history = removeHistoryCode(state.history, code);
  saveHistory();
  renderHistory();
}

function exportHistory() {
  if (!state.history.length) return;
  const csv = `\uFEFF${historyToCsv(state.history, resultForCode)}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `序號查詢紀錄-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function showMessage(message) {
  elements.formMessage.textContent = message;
  elements.formMessage.hidden = false;
}

function hideMessage() {
  elements.formMessage.hidden = true;
  elements.formMessage.textContent = "";
}

function formatDate(value, includeTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? "");
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(date);
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}
