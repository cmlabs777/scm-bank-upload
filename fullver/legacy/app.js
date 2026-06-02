const STORAGE_ENDPOINT_KEY = "scmGasEndpointFullver";
const API_TIMEOUT_MS = 20000;

const MODE_LABELS = {
  withdrawal: "출금",
  income: "입금",
};

const DEFAULT_TYPES = {
  withdrawal: ["생활비", "외식비", "인터넷TV", "차량비", "정기구독", "아파트 관리비", "*투자"],
  income: ["월급-다나", "월급-창모", "이자", "성과급", "부수입", "환급", "기타입금"],
};

const DEFAULT_RULES = {
  withdrawal: [
    { keyword: "커피", type: "외식비", note: "카페 결제" },
    { keyword: "쿠팡", type: "생활비", note: "쿠팡 일반 결제" },
    { keyword: "인터넷", type: "인터넷TV", note: "통신/인터넷 결제" },
    { keyword: "주차", type: "차량비", note: "차량 관련 결제" },
  ],
  income: [
    { keyword: "급여", type: "월급-다나", note: "급여 입금" },
    { keyword: "이자", type: "이자", note: "예금/캐시백 이자" },
    { keyword: "환급", type: "환급", note: "환불/취소/반환" },
  ],
};

const state = {
  uploadMode: "withdrawal",
  typeMode: "withdrawal",
  types: {
    withdrawal: [...DEFAULT_TYPES.withdrawal],
    income: [...DEFAULT_TYPES.income],
  },
  rules: {
    withdrawal: DEFAULT_RULES.withdrawal.map((rule) => ({ ...rule })),
    income: DEFAULT_RULES.income.map((rule) => ({ ...rule })),
  },
  savedTypes: { withdrawal: [], income: [] },
  savedRules: { withdrawal: [], income: [] },
  rows: [],
  existingKeys: {
    withdrawal: new Set(),
    income: new Set(),
  },
  preparedPayload: [],
  investmentRows: [],
  isSyncing: false,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindSettings();
  bindUpload();
  bindTypeEditors();
  bindInvestment();
  snapshotTypeState("withdrawal");
  snapshotTypeState("income");
  renderTypes();
  renderRules();
  renderInvestments();
  updateTypeSummary();
  refreshEndpointStatus();
  setUploadMode("withdrawal", { keepRows: true });
  if (getEndpoint()) loadRemoteState();
});

function bindNavigation() {
  $$("[data-view]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  $$("[data-upload-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      setUploadMode(button.dataset.uploadMode);
      showView("uploadView");
    });
  });

  $$("[data-type-mode]").forEach((button) => {
    button.addEventListener("click", () => setTypeMode(button.dataset.typeMode));
  });
}

function showView(viewId) {
  ["homeView", "uploadView", "typesView", "investmentView"].forEach((id) => {
    $("#" + id).classList.toggle("hidden", id !== viewId);
  });
}

function setUploadMode(mode, options = {}) {
  state.uploadMode = mode === "income" ? "income" : "withdrawal";
  $$("[data-upload-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.uploadMode === state.uploadMode);
  });
  $("#uploadTitle").textContent = `${MODE_LABELS[state.uploadMode]}내역 업로드`;
  $("#uploadHelp").textContent = state.uploadMode === "income"
    ? "엑셀을 선택하면 플러스 금액인 입금 거래만 표시됩니다."
    : "엑셀을 선택하면 마이너스 금액인 출금 거래만 표시됩니다.";
  if (!options.keepRows) {
    state.rows = [];
    state.preparedPayload = [];
    $("#excelInput").value = "";
    $("#selectedFileName").textContent = "선택된 파일 없음";
    renderTransactions();
  }
}

function setTypeMode(mode) {
  collectTypeEditors();
  collectRuleEditors();
  state.typeMode = mode === "income" ? "income" : "withdrawal";
  $$("[data-type-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.typeMode === state.typeMode);
  });
  $("#typesHelp").textContent = state.typeMode === "income"
    ? "`gas 입금유형` 탭의 A열은 유형, C:E열은 자동분류 규칙입니다."
    : "`gas 유형` 탭의 A열은 유형, C:E열은 자동분류 규칙입니다.";
  renderTypes();
  renderRules();
  updateTypeSummary();
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
      await apiPostForm({ action: "appendTransactions", kind: state.uploadMode, rows: state.preparedPayload });
      await loadExistingKeys(state.uploadMode);
      state.rows = state.rows.map((row) => ({
        ...row,
        duplicated: state.existingKeys[state.uploadMode].has(row.uploadKey),
        include: !state.existingKeys[state.uploadMode].has(row.uploadKey),
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
      mode: state.uploadMode,
      existingKeys: state.existingKeys[state.uploadMode],
      types: state.types[state.uploadMode],
      rules: state.rules[state.uploadMode],
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
    tbody.innerHTML = `<tr><td colspan="8" class="empty">${MODE_LABELS[state.uploadMode]} 거래가 없습니다.</td></tr>`;
    $("#uploadButton").disabled = true;
    setSummary(`아직 선택한 ${MODE_LABELS[state.uploadMode]} 거래가 없습니다.`);
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
      <td>${formatWon(row.absoluteAmount)}</td>
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
      row.uploadPayload = ScmParser.toLedgerPayload(row, row.selectedType, row.uploadKey, state.uploadMode);
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
  const options = state.types[state.uploadMode]
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

  state.preparedPayload = selectedRows.map((row) => ScmParser.toLedgerPayload(row, row.selectedType, row.uploadKey, state.uploadMode));
  return { ok: true };
}

function bindTypeEditors() {
  $("#addTypeButton").addEventListener("click", () => {
    collectTypeEditors();
    state.types[state.typeMode].push("");
    renderTypes();
    updateTypeSummary("새 유형 행을 추가했습니다.");
  });

  $("#addRuleButton").addEventListener("click", () => {
    collectTypeEditors();
    collectRuleEditors();
    state.rules[state.typeMode].push({ keyword: "", type: state.types[state.typeMode][0] || "", note: "" });
    renderRules();
    updateTypeSummary("새 자동분류 규칙 행을 추가했습니다.");
  });

  $("#sortTypeButton").addEventListener("click", () => {
    collectTypeEditors();
    state.types[state.typeMode] = uniqueTexts(state.types[state.typeMode]).sort((a, b) => a.localeCompare(b, "ko"));
    normalizeRulesToTypes();
    renderTypes();
    renderRules();
    updateTypeSummary("유형 목록을 정렬했습니다.");
  });

  $("#sortRuleButton").addEventListener("click", () => {
    collectTypeEditors();
    collectRuleEditors();
    state.rules[state.typeMode] = uniqueRules(state.rules[state.typeMode]).sort((a, b) => a.keyword.localeCompare(b.keyword, "ko"));
    renderRules();
    updateTypeSummary("자동분류 규칙을 정렬했습니다.");
  });

  $("#resetTypesButton").addEventListener("click", () => {
    state.types[state.typeMode] = [...state.savedTypes[state.typeMode]];
    state.rules[state.typeMode] = state.savedRules[state.typeMode].map((rule) => ({ ...rule }));
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
    await apiPostForm({ action: "saveTypes", kind: state.typeMode, types: state.types[state.typeMode] });
    await apiPostForm({ action: "saveRules", kind: state.typeMode, rules: state.rules[state.typeMode] });
    await loadTypesAndRules(state.typeMode);
    updateTypeSummary(`저장 완료: 유형 ${state.types[state.typeMode].length}개, 자동분류 규칙 ${state.rules[state.typeMode].length}개`, "ok");
  } catch (error) {
    updateTypeSummary(error.message || "유형 저장 중 오류가 발생했습니다.", "warn");
  } finally {
    setSyncing(false);
  }
}

function renderTypes() {
  const list = $("#typeList");
  list.innerHTML = "";
  state.types[state.typeMode].forEach((type, index) => {
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
      state.types[state.typeMode].splice(Number(button.dataset.removeType), 1);
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
  state.rules[state.typeMode].forEach((rule, index) => {
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
      state.rules[state.typeMode].splice(Number(button.dataset.removeRule), 1);
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
  const options = state.types[state.typeMode]
    .map((type) => `<option value="${escapeHtml(type)}" ${type === selectedType ? "selected" : ""}>${escapeHtml(type)}</option>`)
    .join("");
  return `<select data-rule-type="${index}" aria-label="추천유형">${placeholder}${options}</select>`;
}

function collectTypeEditors() {
  state.types[state.typeMode] = $$("[data-type-index]")
    .map((input) => input.value.trim())
    .filter(Boolean);
}

function collectRuleEditors() {
  state.rules[state.typeMode] = $$(".rule-editor")
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

  state.types[state.typeMode] = uniqueTexts(state.types[state.typeMode]);
  state.rules[state.typeMode] = uniqueRules(state.rules[state.typeMode]);

  if (!state.types[state.typeMode].length) {
    return { ok: false, message: "유형은 최소 1개 이상 필요합니다." };
  }

  const typeSet = new Set(state.types[state.typeMode]);
  const invalidRules = state.rules[state.typeMode].filter((rule) => !typeSet.has(rule.type));
  if (invalidRules.length) {
    return { ok: false, message: `존재하지 않는 유형을 사용하는 규칙이 ${invalidRules.length}개 있습니다.` };
  }

  snapshotTypeState(state.typeMode);
  refreshRowsAfterTypeChange();
  return { ok: true };
}

function snapshotTypeState(mode) {
  state.savedTypes[mode] = [...state.types[mode]];
  state.savedRules[mode] = state.rules[mode].map((rule) => ({ ...rule }));
}

function updateTypeSummary(message, tone = "default") {
  const currentTypes = $$("[data-type-index]").map((input) => input.value.trim()).filter(Boolean);
  const currentRules = $$(".rule-editor")
    .map((row) => ({
      keyword: row.querySelector("[data-rule-keyword]").value.trim(),
      type: row.querySelector("[data-rule-type]").value,
    }))
    .filter((rule) => rule.keyword || rule.type);

  const fallback = `${MODE_LABELS[state.typeMode]} 유형 ${currentTypes.length}개 · 자동분류 규칙 ${currentRules.length}개`;
  const summary = $("#typesSummary");
  summary.textContent = message || fallback;
  summary.classList.toggle("ok", tone === "ok");
  summary.classList.toggle("warn", tone === "warn");
}

function normalizeRulesToTypes() {
  const typeSet = new Set(state.types[state.typeMode]);
  state.rules[state.typeMode] = state.rules[state.typeMode].map((rule) => ({
    ...rule,
    type: typeSet.has(rule.type) ? rule.type : "",
  }));
}

function refreshRowsAfterTypeChange() {
  if (!state.rows.length || state.typeMode !== state.uploadMode) return;
  state.rows = state.rows.map((row) => {
    const selectedType = state.types[state.uploadMode].includes(row.selectedType)
      ? row.selectedType
      : ScmParser.guessType(row, state.types[state.uploadMode], state.rules[state.uploadMode]);
    return {
      ...row,
      selectedType,
      uploadPayload: ScmParser.toLedgerPayload(row, selectedType, row.uploadKey, state.uploadMode),
    };
  });
  renderTransactions();
}

function bindInvestment() {
  const today = new Date();
  $("#investmentDate").value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  ["#investmentPrice", "#investmentQuantity"].forEach((selector) => {
    $(selector).addEventListener("input", calculateInvestmentAmount);
  });
  $("#addInvestmentButton").addEventListener("click", addInvestmentRow);
  $("#saveInvestmentButton").addEventListener("click", saveInvestmentsToRemote);
}

function calculateInvestmentAmount() {
  const price = Number($("#investmentPrice").value || 0);
  const quantity = Number($("#investmentQuantity").value || 0);
  const amountInput = $("#investmentAmount");
  if (price > 0 && quantity > 0 && !amountInput.dataset.manual) {
    amountInput.value = Math.round(price * quantity);
  }
}

function addInvestmentRow() {
  const row = {
    tradeKind: $("#investmentKind").value.trim(),
    category: $("#investmentCategory").value.trim(),
    product: $("#investmentProduct").value.trim(),
    date: $("#investmentDate").value,
    price: Number($("#investmentPrice").value || 0),
    quantity: Number($("#investmentQuantity").value || 0),
    amount: Number($("#investmentAmount").value || 0),
    fee: Number($("#investmentFee").value || 0),
    profit: Number($("#investmentProfit").value || 0),
    note: $("#investmentNote").value.trim(),
  };

  if (!row.product || !row.date || row.amount <= 0) {
    setInvestmentSummary("상품, 거래일, 금액은 필수입니다.", "warn");
    return;
  }

  row.uploadKey = ["investment", row.tradeKind, row.product, row.date, row.amount, row.quantity, row.note].join("|");
  state.investmentRows.push(row);
  clearInvestmentInputs();
  renderInvestments();
  setInvestmentSummary(`목록에 추가했습니다: ${state.investmentRows.length}건`);
}

function clearInvestmentInputs() {
  ["#investmentCategory", "#investmentProduct", "#investmentPrice", "#investmentQuantity", "#investmentAmount", "#investmentFee", "#investmentProfit", "#investmentNote"].forEach((selector) => {
    $(selector).value = "";
  });
}

function renderInvestments() {
  const tbody = $("#investmentRows");
  tbody.innerHTML = "";
  if (!state.investmentRows.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty">아직 추가한 투자 거래가 없습니다.</td></tr>';
    $("#saveInvestmentButton").disabled = true;
    return;
  }

  state.investmentRows.forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.tradeKind)}</td>
      <td>${escapeHtml(row.category)}</td>
      <td>${escapeHtml(row.product)}</td>
      <td>${escapeHtml(row.date)}</td>
      <td>${formatNumber(row.price)}</td>
      <td>${formatNumber(row.quantity)}</td>
      <td>${formatWon(row.amount)}</td>
      <td>${formatWon(row.fee)}</td>
      <td>${formatWon(row.profit)}</td>
      <td>${escapeHtml(row.note)}</td>
      <td><button class="remove-button" type="button" data-remove-investment="${index}">삭제</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-remove-investment]").forEach((button) => {
    button.addEventListener("click", () => {
      state.investmentRows.splice(Number(button.dataset.removeInvestment), 1);
      renderInvestments();
      setInvestmentSummary("투자 거래를 삭제했습니다.");
    });
  });
  $("#saveInvestmentButton").disabled = false;
}

async function saveInvestmentsToRemote() {
  if (!state.investmentRows.length) {
    setInvestmentSummary("저장할 투자 거래가 없습니다.", "warn");
    return;
  }
  try {
    setSyncing(true);
    setInvestmentSummary(`투자raw 저장 중입니다: ${state.investmentRows.length}건`);
    await apiPostForm({ action: "appendInvestments", rows: state.investmentRows });
    const count = state.investmentRows.length;
    state.investmentRows = [];
    renderInvestments();
    setInvestmentSummary(`투자raw 저장 요청 완료: ${count}건`, "ok");
  } catch (error) {
    setInvestmentSummary(error.message || "투자 저장 중 오류가 발생했습니다.", "warn");
  } finally {
    setSyncing(false);
  }
}

function setInvestmentSummary(message, tone = "default") {
  const summary = $("#investmentSummary");
  summary.textContent = message;
  summary.classList.toggle("ok", tone === "ok");
  summary.classList.toggle("warn", tone === "warn");
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
    await Promise.all([
      loadTypesAndRules("withdrawal"),
      loadTypesAndRules("income"),
      loadExistingKeys("withdrawal"),
      loadExistingKeys("income"),
    ]);
    $("#connectionStatus").textContent = "연결됨 · fullver";
    updateTypeSummary(`불러오기 완료: ${MODE_LABELS[state.typeMode]} 유형 ${state.types[state.typeMode].length}개`, "ok");
    if (state.rows.length) {
      state.rows = state.rows.map((row) => ({
        ...row,
        duplicated: state.existingKeys[state.uploadMode].has(row.uploadKey),
        include: !state.existingKeys[state.uploadMode].has(row.uploadKey),
        selectedType: state.types[state.uploadMode].includes(row.selectedType)
          ? row.selectedType
          : ScmParser.guessType(row, state.types[state.uploadMode], state.rules[state.uploadMode]),
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
  return result.data || {};
}

async function loadTypesAndRules(mode) {
  const [typesResult, rulesResult] = await Promise.all([
    apiGet("getTypes", { kind: mode }),
    apiGet("getRules", { kind: mode }),
  ]);

  if (!typesResult.ok) throw new Error(typesResult.error || `${MODE_LABELS[mode]} 유형 목록 조회 실패`);
  if (!rulesResult.ok) throw new Error(rulesResult.error || `${MODE_LABELS[mode]} 자동분류 규칙 조회 실패`);

  state.types[mode] = Array.isArray(typesResult.data) && typesResult.data.length ? typesResult.data : state.types[mode];
  state.rules[mode] = Array.isArray(rulesResult.data) ? rulesResult.data : [];
  snapshotTypeState(mode);
  if (state.typeMode === mode) {
    renderTypes();
    renderRules();
  }
}

async function loadExistingKeys(mode) {
  const result = await apiGet("getExistingKeys", { kind: mode });
  if (!result.ok) throw new Error(result.error || `${MODE_LABELS[mode]} 기존 업로드키 조회 실패`);
  state.existingKeys[mode] = new Set(Array.isArray(result.data) ? result.data : []);
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
    "#addInvestmentButton",
    "#saveInvestmentButton",
  ].forEach((selector) => {
    const element = $(selector);
    if (element) element.disabled = isSyncing;
  });
  if (!isSyncing) {
    refreshEndpointStatus();
    if (state.rows.length) updateUploadReadiness();
    renderInvestments();
  }
}

function formatWon(value) {
  return new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 }).format(value || 0);
}

function formatNumber(value) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 6 }).format(value || 0);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
