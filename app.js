const STORAGE_ENDPOINT_KEY = "scmGasEndpoint";
const API_TIMEOUT_MS = 20000;

const state = {
  types: ["생활비", "외식비", "인터넷TV", "차량비", "정기구독", "아파트 관리비"],
  rules: [
    { keyword: "커피", type: "외식비", note: "카페 결제" },
    { keyword: "쿠팡", type: "생활비", note: "쿠팡 일반 결제" },
    { keyword: "인터넷", type: "인터넷TV", note: "통신/인터넷 결제" },
    { keyword: "주차", type: "차량비", note: "차량 관련 결제" },
  ],
  rows: [],
  existingKeys: new Set(),
  preparedPayload: [],
  savedTypes: [],
  savedRules: [],
  isSyncing: false,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindSettings();
  bindUpload();
  bindTypeEditors();
  snapshotTypeState();
  renderTypes();
  renderRules();
  updateTypeSummary();
  refreshEndpointStatus();
  if (getEndpoint()) loadRemoteState();
});

function bindNavigation() {
  $$("[data-view]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
}

function showView(viewId) {
  ["homeView", "uploadView", "typesView"].forEach((id) => {
    $("#" + id).classList.toggle("hidden", id !== viewId);
  });
}

function bindSettings() {
  const endpointInput = $("#endpointInput");
  endpointInput.value = localStorage.getItem(STORAGE_ENDPOINT_KEY) || "";

  $("#saveEndpointButton").addEventListener("click", () => {
    localStorage.setItem(STORAGE_ENDPOINT_KEY, endpointInput.value.trim());
    refreshEndpointStatus();
    loadRemoteState();
  });

  $("#loadEndpointButton").addEventListener("click", () => {
    loadRemoteState();
  });
}

function refreshEndpointStatus() {
  const endpoint = localStorage.getItem(STORAGE_ENDPOINT_KEY);
  $("#connectionStatus").textContent = endpoint ? "Apps Script URL 설정됨" : "Apps Script URL 미설정";
  $("#loadEndpointButton").disabled = !endpoint;
}

function bindUpload() {
  $("#excelInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await parseExcel(file);
  });

  $("#uploadButton").addEventListener("click", async () => {
    const validation = prepareUploadPayload();
    if (!validation.ok) {
      setSummary(validation.message, "warn");
      return;
    }

    try {
      setSyncing(true);
      setSummary(`업로드 중입니다: ${state.preparedPayload.length}건`);
      await apiPostForm({ action: "appendWithdrawals", rows: state.preparedPayload });
      await loadExistingKeys();
      state.rows = state.rows.map((row) => ({
        ...row,
        duplicated: state.existingKeys.has(row.uploadKey),
        include: !state.existingKeys.has(row.uploadKey),
      }));
      renderTransactions();
      setSummary(`업로드 요청 완료: ${state.preparedPayload.length}건. 중복키를 다시 불러왔습니다.`, "ok");
    } catch (error) {
      setSummary(error.message || "업로드 중 오류가 발생했습니다.", "warn");
    } finally {
      setSyncing(false);
    }
  });
}

async function parseExcel(file) {
  if (!window.XLSX) {
    setSummary("엑셀 라이브러리를 불러오지 못했습니다.", "warn");
    return;
  }

  $("#selectedFileName").textContent = file.name;
  setSummary("엑셀 파일을 읽는 중입니다.");

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: true, defval: "" });

  try {
    state.rows = ScmParser.parseBankRows(rows, {
      existingKeys: state.existingKeys,
      types: state.types,
      rules: state.rules,
    });
  } catch (error) {
    state.rows = [];
    state.preparedPayload = [];
    renderTransactions();
    setSummary(error.message || "엑셀 파싱 중 오류가 발생했습니다.", "warn");
    return;
  }

  renderTransactions();
}

function renderTransactions() {
  const tbody = $("#transactionRows");
  tbody.innerHTML = "";

  if (!state.rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">출금 거래가 없습니다.</td></tr>';
    $("#uploadButton").disabled = true;
    setSummary("출금 거래가 없습니다.", "warn");
    return;
  }

  state.rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.className = row.include ? "" : "excluded-row";
    tr.innerHTML = `
      <td class="check-cell">
        <input type="checkbox" data-include-index="${index}" ${row.include ? "checked" : ""} aria-label="업로드 포함">
      </td>
      <td><span class="badge ${row.duplicated ? "dup" : "new"}">${row.duplicated ? "중복 제외" : "신규"}</span></td>
      <td>${escapeHtml(row.tradedAt)}</td>
      <td>${formatWon(Math.abs(row.amount))}</td>
      <td>${escapeHtml(row.method)}</td>
      <td>${escapeHtml(row.description)}</td>
      <td>${escapeHtml(row.memo)}</td>
      <td>${renderTypeSelect(index, row.selectedType)}</td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("select[data-row-index]").forEach((select) => {
    select.addEventListener("change", () => {
      const row = state.rows[Number(select.dataset.rowIndex)];
      row.selectedType = select.value;
      row.uploadPayload = ScmParser.toUploadPayload(row, row.selectedType, row.uploadKey);
      updateUploadReadiness();
    });
  });

  tbody.querySelectorAll("input[data-include-index]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const row = state.rows[Number(checkbox.dataset.includeIndex)];
      row.include = checkbox.checked;
      checkbox.closest("tr").classList.toggle("excluded-row", !row.include);
      updateUploadReadiness();
    });
  });

  updateUploadReadiness();
}

function renderTypeSelect(index, selectedType) {
  const placeholder = '<option value="">유형 선택</option>';
  const options = state.types
    .map((type) => `<option value="${escapeHtml(type)}" ${type === selectedType ? "selected" : ""}>${escapeHtml(type)}</option>`)
    .join("");
  return `<select data-row-index="${index}">${placeholder}${options}</select>`;
}

function updateUploadReadiness() {
  const selectedRows = state.rows.filter((row) => row.include);
  const duplicateCount = state.rows.filter((row) => row.duplicated).length;
  const selectedDuplicateCount = selectedRows.filter((row) => row.duplicated).length;
  const missingTypeCount = selectedRows.filter((row) => !row.selectedType).length;
  const totalAmount = selectedRows.reduce((sum, row) => sum + row.absoluteAmount, 0);

  $("#uploadButton").disabled = selectedRows.length === 0 || missingTypeCount > 0;

  const parts = [
    `전체 ${state.rows.length}건`,
    `업로드 선택 ${selectedRows.length}건`,
    `중복 제외 ${duplicateCount - selectedDuplicateCount}건`,
    `선택 금액 ${formatWon(totalAmount)}`,
  ];
  if (selectedDuplicateCount) parts.push(`중복 수동 포함 ${selectedDuplicateCount}건`);
  if (missingTypeCount) parts.push(`유형 미선택 ${missingTypeCount}건`);

  setSummary(parts.join(" · "), missingTypeCount ? "warn" : "default");
}

function prepareUploadPayload() {
  const selectedRows = state.rows.filter((row) => row.include);
  if (!selectedRows.length) {
    state.preparedPayload = [];
    return { ok: false, message: "업로드할 거래가 없습니다." };
  }

  const missingTypeRows = selectedRows.filter((row) => !row.selectedType);
  if (missingTypeRows.length) {
    state.preparedPayload = [];
    return { ok: false, message: `유형이 선택되지 않은 거래가 ${missingTypeRows.length}건 있습니다.` };
  }

  state.preparedPayload = selectedRows.map((row) => ScmParser.toUploadPayload(row, row.selectedType, row.uploadKey));
  return { ok: true };
}

function bindTypeEditors() {
  $("#addTypeButton").addEventListener("click", () => {
    collectTypeEditors();
    state.types.push("");
    renderTypes();
    updateTypeSummary("새 유형 행을 추가했습니다.");
  });

  $("#addRuleButton").addEventListener("click", () => {
    collectTypeEditors();
    collectRuleEditors();
    state.rules.push({ keyword: "", type: state.types[0] || "", note: "" });
    renderRules();
    updateTypeSummary("새 자동분류 규칙 행을 추가했습니다.");
  });

  $("#sortTypeButton").addEventListener("click", () => {
    collectTypeEditors();
    state.types = uniqueTexts(state.types).sort((a, b) => a.localeCompare(b, "ko"));
    normalizeRulesToTypes();
    renderTypes();
    renderRules();
    updateTypeSummary("유형 목록을 정렬했습니다.");
  });

  $("#sortRuleButton").addEventListener("click", () => {
    collectTypeEditors();
    collectRuleEditors();
    state.rules = uniqueRules(state.rules).sort((a, b) => a.keyword.localeCompare(b.keyword, "ko"));
    renderRules();
    updateTypeSummary("자동분류 규칙을 정렬했습니다.");
  });

  $("#resetTypesButton").addEventListener("click", () => {
    state.types = [...state.savedTypes];
    state.rules = state.savedRules.map((rule) => ({ ...rule }));
    renderTypes();
    renderRules();
    updateTypeSummary("마지막 저장 상태로 되돌렸습니다.");
  });

  $("#saveTypesButton").addEventListener("click", () => {
    saveTypesToRemote();
  });
}

async function saveTypesToRemote() {
    const validation = saveTypeState();
    if (!validation.ok) {
      updateTypeSummary(validation.message, "warn");
      return;
    }

    try {
      setSyncing(true);
      updateTypeSummary("Google Sheet에 저장 중입니다.");
      await apiPostForm({ action: "saveTypes", types: state.types });
      await apiPostForm({ action: "saveRules", rules: state.rules });
      await loadTypesAndRules();
      updateTypeSummary(`저장 완료: 유형 ${state.types.length}개, 자동분류 규칙 ${state.rules.length}개`, "ok");
    } catch (error) {
      updateTypeSummary(error.message || "유형 저장 중 오류가 발생했습니다.", "warn");
    } finally {
      setSyncing(false);
    }
}

function renderTypes() {
  const list = $("#typeList");
  list.innerHTML = "";
  state.types.forEach((type, index) => {
    const row = document.createElement("div");
    row.className = "row-editor";
    row.innerHTML = `
      <input data-type-index="${index}" value="${escapeHtml(type)}" aria-label="유형명">
      <button class="remove-button" type="button" data-remove-type="${index}">삭제</button>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll("[data-remove-type]").forEach((button) => {
    button.addEventListener("click", () => {
      collectTypeEditors();
      collectRuleEditors();
      state.types.splice(Number(button.dataset.removeType), 1);
      normalizeRulesToTypes();
      renderTypes();
      renderRules();
      updateTypeSummary("유형을 삭제했습니다.");
    });
  });

  list.querySelectorAll("[data-type-index]").forEach((input) => {
    input.addEventListener("input", () => updateTypeSummary());
  });
}

function renderRules() {
  const list = $("#ruleList");
  list.innerHTML = "";
  state.rules.forEach((rule, index) => {
    const row = document.createElement("div");
    row.className = "rule-editor";
    row.innerHTML = `
      <input data-rule-keyword="${index}" value="${escapeHtml(rule.keyword)}" placeholder="키워드" aria-label="키워드">
      ${renderRuleTypeSelect(index, rule.type)}
      <input data-rule-note="${index}" value="${escapeHtml(rule.note)}" placeholder="설명" aria-label="설명">
      <button class="remove-button" type="button" data-remove-rule="${index}">삭제</button>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll("[data-remove-rule]").forEach((button) => {
    button.addEventListener("click", () => {
      collectTypeEditors();
      collectRuleEditors();
      state.rules.splice(Number(button.dataset.removeRule), 1);
      renderRules();
      updateTypeSummary("자동분류 규칙을 삭제했습니다.");
    });
  });

  list.querySelectorAll("input, select").forEach((input) => {
    input.addEventListener("input", () => updateTypeSummary());
    input.addEventListener("change", () => updateTypeSummary());
  });
}

function renderRuleTypeSelect(index, selectedType) {
  const placeholder = '<option value="">유형 선택</option>';
  const options = state.types
    .map((type) => `<option value="${escapeHtml(type)}" ${type === selectedType ? "selected" : ""}>${escapeHtml(type)}</option>`)
    .join("");
  return `<select data-rule-type="${index}" aria-label="추천유형">${placeholder}${options}</select>`;
}

function collectTypeEditors() {
  state.types = $$("[data-type-index]")
    .map((input) => input.value.trim())
    .filter(Boolean);
}

function collectRuleEditors() {
  state.rules = $$(".rule-editor")
    .map((row) => ({
      keyword: row.querySelector("[data-rule-keyword]").value.trim(),
      type: row.querySelector("[data-rule-type]").value,
      note: row.querySelector("[data-rule-note]").value.trim(),
    }))
    .filter((rule) => rule.keyword && rule.type);
}

function saveTypeState() {
  collectTypeEditors();
  collectRuleEditors();

  state.types = uniqueTexts(state.types);
  state.rules = uniqueRules(state.rules);

  if (!state.types.length) {
    return { ok: false, message: "유형은 최소 1개 이상 필요합니다." };
  }

  const typeSet = new Set(state.types);
  const invalidRules = state.rules.filter((rule) => !typeSet.has(rule.type));
  if (invalidRules.length) {
    return { ok: false, message: `존재하지 않는 유형을 사용하는 규칙이 ${invalidRules.length}개 있습니다.` };
  }

  snapshotTypeState();
  refreshRowsAfterTypeChange();
  return { ok: true };
}

function snapshotTypeState() {
  state.savedTypes = [...state.types];
  state.savedRules = state.rules.map((rule) => ({ ...rule }));
}

function updateTypeSummary(message, tone = "default") {
  const currentTypes = $$("[data-type-index]").map((input) => input.value.trim()).filter(Boolean);
  const currentRules = $$(".rule-editor")
    .map((row) => ({
      keyword: row.querySelector("[data-rule-keyword]").value.trim(),
      type: row.querySelector("[data-rule-type]").value,
    }))
    .filter((rule) => rule.keyword || rule.type);

  const fallback = `유형 ${currentTypes.length}개 · 자동분류 규칙 ${currentRules.length}개`;
  const summary = $("#typesSummary");
  summary.textContent = message || fallback;
  summary.classList.toggle("ok", tone === "ok");
  summary.classList.toggle("warn", tone === "warn");
}

function normalizeRulesToTypes() {
  const typeSet = new Set(state.types);
  state.rules = state.rules.map((rule) => ({
    ...rule,
    type: typeSet.has(rule.type) ? rule.type : "",
  }));
}

function refreshRowsAfterTypeChange() {
  if (!state.rows.length) return;
  state.rows = state.rows.map((row) => {
    const selectedType = state.types.includes(row.selectedType) ? row.selectedType : ScmParser.guessType(row, state.types, state.rules);
    return {
      ...row,
      selectedType,
      uploadPayload: ScmParser.toUploadPayload(row, selectedType, row.uploadKey),
    };
  });
  renderTransactions();
}

function uniqueTexts(values) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function uniqueRules(rules) {
  const seen = new Set();
  return rules.filter((rule) => {
    const normalized = {
      keyword: rule.keyword.trim(),
      type: rule.type.trim(),
      note: rule.note.trim(),
    };
    const key = `${normalized.keyword}|${normalized.type}`;
    if (!normalized.keyword || !normalized.type || seen.has(key)) return false;
    seen.add(key);
    rule.keyword = normalized.keyword;
    rule.type = normalized.type;
    rule.note = normalized.note;
    return true;
  });
}

function setSummary(message, tone = "default") {
  const summary = $("#uploadSummary");
  summary.textContent = message;
  summary.classList.toggle("ok", tone === "ok");
  summary.classList.toggle("warn", tone === "warn");
}

async function loadRemoteState() {
  if (!getEndpoint()) {
    $("#connectionStatus").textContent = "Apps Script URL 미설정";
    updateTypeSummary("Apps Script URL을 먼저 입력해 주세요.", "warn");
    return;
  }

  try {
    setSyncing(true);
    $("#connectionStatus").textContent = "연결 점검 중";
    await checkRemoteHealth();
    $("#connectionStatus").textContent = "Google Sheet 불러오는 중";
    await Promise.all([loadTypesAndRules(), loadExistingKeys()]);
    $("#connectionStatus").textContent = `연결됨 · 유형 ${state.types.length}개`;
    updateTypeSummary(`불러오기 완료: 유형 ${state.types.length}개 · 자동분류 규칙 ${state.rules.length}개`, "ok");
    if (state.rows.length) {
      state.rows = state.rows.map((row) => ({
        ...row,
        duplicated: state.existingKeys.has(row.uploadKey),
        include: !state.existingKeys.has(row.uploadKey),
        selectedType: state.types.includes(row.selectedType) ? row.selectedType : ScmParser.guessType(row, state.types, state.rules),
      }));
      renderTransactions();
    }
  } catch (error) {
    $("#connectionStatus").textContent = "연결 실패";
    updateTypeSummary(error.message || "Google Sheet를 불러오지 못했습니다.", "warn");
  } finally {
    setSyncing(false);
  }
}

async function checkRemoteHealth() {
  const result = await apiGet("health");
  if (!result.ok) throw new Error(result.error || "연결 점검 실패");

  const data = result.data || {};
  if (!data.withdrawalSheetExists) throw new Error("출금내역 탭을 찾을 수 없습니다.");
  if (!data.withdrawalHeaderRow) throw new Error("출금내역 raw data 헤더를 찾을 수 없습니다.");
  return data;
}

async function loadTypesAndRules() {
  const [typesResult, rulesResult] = await Promise.all([
    apiGet("getTypes"),
    apiGet("getRules"),
  ]);

  if (!typesResult.ok) throw new Error(typesResult.error || "유형 목록 조회 실패");
  if (!rulesResult.ok) throw new Error(rulesResult.error || "자동분류 규칙 조회 실패");

  state.types = Array.isArray(typesResult.data) && typesResult.data.length ? typesResult.data : state.types;
  state.rules = Array.isArray(rulesResult.data) ? rulesResult.data : [];
  snapshotTypeState();
  renderTypes();
  renderRules();
}

async function loadExistingKeys() {
  const result = await apiGet("getExistingWithdrawalKeys");
  if (!result.ok) throw new Error(result.error || "기존 업로드키 조회 실패");
  state.existingKeys = new Set(Array.isArray(result.data) ? result.data : []);
}

function getEndpoint() {
  return (localStorage.getItem(STORAGE_ENDPOINT_KEY) || "").trim().replace(/\/$/, "");
}

function buildApiUrl(action, params = {}) {
  const endpoint = getEndpoint();
  if (!endpoint) throw new Error("Apps Script Web App URL을 먼저 저장해 주세요.");

  const url = new URL(endpoint);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  });
  return url;
}

function apiGet(action, params = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `scmJsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`${action} 요청 시간이 초과되었습니다.`));
    }, API_TIMEOUT_MS);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (result) => {
      cleanup();
      resolve(result);
    };

    try {
      const url = buildApiUrl(action, { ...params, callback: callbackName });
      script.src = url.toString();
      script.onerror = () => {
        cleanup();
        reject(new Error(`${action} 요청에 실패했습니다.`));
      };
      document.body.appendChild(script);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

function apiPostForm(payload) {
  return new Promise((resolve, reject) => {
    const endpoint = getEndpoint();
    if (!endpoint) {
      reject(new Error("Apps Script Web App URL을 먼저 저장해 주세요."));
      return;
    }

    const frameName = `scmPostFrame_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const iframe = document.createElement("iframe");
    const form = document.createElement("form");
    const input = document.createElement("input");
    let submitted = false;
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`${payload.action || "저장"} 요청 시간이 초과되었습니다.`));
    }, API_TIMEOUT_MS);

    function cleanup() {
      window.clearTimeout(timeout);
      form.remove();
      iframe.remove();
    }

    iframe.name = frameName;
    iframe.className = "hidden-frame";
    iframe.addEventListener("load", () => {
      if (!submitted) return;
      cleanup();
      resolve({ ok: true });
    });

    form.method = "POST";
    form.action = endpoint;
    form.target = frameName;
    form.className = "hidden-form";

    input.type = "hidden";
    input.name = "payload";
    input.value = JSON.stringify(payload);

    form.appendChild(input);
    document.body.appendChild(iframe);
    document.body.appendChild(form);
    submitted = true;
    form.submit();
  });
}

function setSyncing(isSyncing) {
  state.isSyncing = isSyncing;
  [
    "#saveEndpointButton",
    "#loadEndpointButton",
    "#uploadButton",
    "#saveTypesButton",
    "#resetTypesButton",
    "#addTypeButton",
    "#addRuleButton",
    "#sortTypeButton",
    "#sortRuleButton",
  ].forEach((selector) => {
    const element = $(selector);
    if (element) element.disabled = isSyncing;
  });
  if (!isSyncing) {
    refreshEndpointStatus();
    if (state.rows.length) updateUploadReadiness();
  }
}

function formatWon(value) {
  return new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 }).format(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
