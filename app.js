const POINTS_BY_PLACE = [500, 375, 265, 200, 150, 125, 100, 80, 65, 50, 40, 30];
const MIN_TEAMS = 3;
const MAX_TEAMS = 12;
const MAX_WEEKS = 11;
const INSCRIPTION_FEE_DOP = 15000;
const INSCRIPTION_FINAL_POOL_DOP = 10000;
const INSCRIPTION_HOST_EARNINGS_DOP = 5000;
const REGULAR_WEEK_FEE_DOP = 6000;
const DEFAULT_FINAL_WEEK_FEE_DOP = 9000;
const STORAGE_KEY = "team-results-tracker:v1";
const MEDAL_TONES = ["gold", "silver", "bronze"];
const LOGO_SRC = "assets/pnglogo.png";
const PAYMENT_DEFAULTS_VERSION = 2;
const API_STATE_URL = window.TOUR_API_STATE_URL || "/api/state";
const API_PRESENCE_URL = window.TOUR_API_PRESENCE_URL || API_STATE_URL.replace(/\/state$/, "/presence");
const API_AUTH_URL = window.TOUR_API_AUTH_URL || API_STATE_URL.replace(/\/state$/, "/auth/login");
const ADMIN_TOKEN_KEY = "tour-admin-token";
const SYNC_POLL_INTERVAL_MS = 5000;
const LOCAL_SAVE_GRACE_MS = 2500;
const PRESENCE_HEARTBEAT_INTERVAL_MS = 15000;
const PRESENCE_MAX_DOTS = 18;

const defaultTeams = Array.from({ length: MAX_TEAMS }, (_, index) => ({
  id: `team-${index + 1}`,
  name: `Equipo ${index + 1}`,
}));

const appState = loadAppState();
let state = appState.categories[appState.activeCategory];
let activeWeek = state.activeWeek || 1;
let selectedTeamId = null;
let apiSaveTimer = null;
let isApplyingRemoteState = false;
let lastLocalSaveAt = 0;
let lastKnownStateJson = JSON.stringify(appState);
const viewerId = getViewerId();
let adminToken = localStorage.getItem(ADMIN_TOKEN_KEY) || "";

const els = {
  categorySelect: document.querySelector("#categorySelect"),
  teamCountInput: document.querySelector("#teamCountInput"),
  weekLimitInput: document.querySelector("#weekLimitInput"),
  showWeeksButton: document.querySelector("#showWeeksButton"),
  finalDonationInput: document.querySelector("#finalDonationInput"),
  paymentTable: document.querySelector("#paymentTable"),
  paymentSummary: document.querySelector("#paymentSummary"),
  weekSelect: document.querySelector("#weekSelect"),
  doubleToggle: document.querySelector("#doubleToggle"),
  teamEditorWrap: document.querySelector("#teamEditorWrap"),
  teamEditor: document.querySelector("#teamEditor"),
  teamPool: document.querySelector("#teamPool"),
  placementGrid: document.querySelector("#placementGrid"),
  standingsList: document.querySelector("#standingsList"),
  reportTable: document.querySelector("#reportTable"),
  placementTitle: document.querySelector("#placementTitle"),
  weekAssignedCount: document.querySelector("#weekAssignedCount"),
  poolCount: document.querySelector("#poolCount"),
  clearWeekButton: document.querySelector("#clearWeekButton"),
  resetButton: document.querySelector("#resetButton"),
  exportDataButton: document.querySelector("#exportDataButton"),
  importDataButton: document.querySelector("#importDataButton"),
  importDataInput: document.querySelector("#importDataInput"),
  downloadWeekButton: document.querySelector("#downloadWeekButton"),
  downloadOverallButton: document.querySelector("#downloadOverallButton"),
  toggleNamesButton: document.querySelector("#toggleNamesButton"),
  restoreNamesButton: document.querySelector("#restoreNamesButton"),
  prizeSubtitle: document.querySelector("#prizeSubtitle"),
  reportExport: document.querySelector("#reportExport"),
  reportExportStatus: document.querySelector("#reportExportStatus"),
  reportDownloadLink: document.querySelector("#reportDownloadLink"),
  reportPreview: document.querySelector("#reportPreview"),
  finalFeeModal: document.querySelector("#finalFeeModal"),
  finalFeeModalInput: document.querySelector("#finalFeeModalInput"),
  cancelFinalFeeButton: document.querySelector("#cancelFinalFeeButton"),
  saveFinalFeeButton: document.querySelector("#saveFinalFeeButton"),
  presenceDots: document.querySelector("#presenceDots"),
  loginButton: document.querySelector("#loginButton"),
  adminLoginModal: document.querySelector("#adminLoginModal"),
  adminPasswordInput: document.querySelector("#adminPasswordInput"),
  cancelLoginButton: document.querySelector("#cancelLoginButton"),
  submitLoginButton: document.querySelector("#submitLoginButton"),
  authError: document.querySelector("#authError"),
};

function createCategoryState(overrides = {}) {
  return {
    activeWeek: 1,
    teamCount: MAX_TEAMS,
    weekLimit: MAX_WEEKS,
    paymentDefaultsVersion: PAYMENT_DEFAULTS_VERSION,
    finalDonation: 0,
    finalWeekFee: DEFAULT_FINAL_WEEK_FEE_DOP,
    hiddenWeeks: [],
    inscriptionPaidTeamIds: [],
    teams: structuredClone(defaultTeams),
    weeks: Array.from({ length: MAX_WEEKS }, (_, index) => ({
      week: index + 1,
      doublePoints: false,
      paidTeamIds: [],
      placements: Array(MAX_TEAMS).fill(null),
    })),
    ...overrides,
  };
}

function normalizeCategoryState(saved = {}) {
  const shouldPreservePayments = Number(saved.paymentDefaultsVersion) >= PAYMENT_DEFAULTS_VERSION;
  const weeks = Array.from({ length: MAX_WEEKS }, (_, index) => {
    const savedWeek = saved.weeks?.[index] ?? {};
    return {
      week: index + 1,
      doublePoints: Boolean(savedWeek.doublePoints),
      paidTeamIds: shouldPreservePayments ? normalizePaidTeamIds(savedWeek.paidTeamIds) : [],
      placements: Array.from({ length: MAX_TEAMS }, (_, placeIndex) => {
        const teamId = savedWeek.placements?.[placeIndex] ?? null;
        return typeof teamId === "string" ? teamId : null;
      }),
    };
  });

  const teams = defaultTeams.map((team, index) => ({
    ...team,
    name: normalizeSavedTeamName(saved.teams?.[index]?.name, index),
  }));

  return createCategoryState({
    activeWeek: clamp(Number(saved.activeWeek) || 1, 1, MAX_WEEKS),
    teamCount: clamp(Number(saved.teamCount) || MAX_TEAMS, MIN_TEAMS, MAX_TEAMS),
    weekLimit: clamp(Number(saved.weekLimit) || MAX_WEEKS, 1, MAX_WEEKS),
    paymentDefaultsVersion: PAYMENT_DEFAULTS_VERSION,
    finalDonation: Math.max(0, Number(saved.finalDonation) || 0),
    finalWeekFee: Math.max(0, Number(saved.finalWeekFee) || DEFAULT_FINAL_WEEK_FEE_DOP),
    hiddenWeeks: normalizeHiddenWeeks(saved.hiddenWeeks),
    inscriptionPaidTeamIds: shouldPreservePayments ? normalizePaidTeamIds(saved.inscriptionPaidTeamIds) : [],
    teams,
    weeks,
  });
}

function normalizePaidTeamIds(savedIds) {
  if (!Array.isArray(savedIds)) return defaultTeams.map((team) => team.id);
  const validIds = new Set(defaultTeams.map((team) => team.id));
  return savedIds.filter((teamId) => validIds.has(teamId));
}

function normalizeHiddenWeeks(savedWeeks) {
  if (!Array.isArray(savedWeeks)) return [];
  return [...new Set(savedWeeks.map(Number))]
    .filter((week) => Number.isInteger(week) && week >= 1 && week <= MAX_WEEKS)
    .sort((a, b) => a - b);
}

function loadAppState() {
  try {
    if (window.TOUR_INITIAL_STATE) {
      return normalizeAppStatePayload(window.TOUR_INITIAL_STATE.data || window.TOUR_INITIAL_STATE);
    }
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return normalizeAppStatePayload(saved);
  } catch {
    return normalizeAppStatePayload(null);
  }
}

function normalizeAppStatePayload(saved) {
  if (!saved) {
    return {
      activeCategory: "A",
      categories: {
        A: createCategoryState(),
        B: createCategoryState(),
      },
    };
  }

  if (saved.categories) {
    const activeCategory = saved.activeCategory === "B" ? "B" : "A";
    return {
      activeCategory,
      categories: {
        A: normalizeCategoryState(saved.categories.A),
        B: normalizeCategoryState(saved.categories.B),
      },
    };
  }

  return {
    activeCategory: "A",
    categories: {
      A: normalizeCategoryState(saved),
      B: createCategoryState(),
    },
  };
}

function saveState() {
  state.activeWeek = activeWeek;
  appState.categories[appState.activeCategory] = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  lastKnownStateJson = JSON.stringify(appState);
  if (!isApplyingRemoteState && isAdminMode()) {
    lastLocalSaveAt = Date.now();
    queueApiSave();
  }
}

function queueApiSave() {
  if (!window.fetch || !API_STATE_URL || !isAdminMode()) return;
  window.clearTimeout(apiSaveTimer);
  apiSaveTimer = window.setTimeout(() => {
    apiSaveTimer = null;
    fetch(API_STATE_URL, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(appState),
    })
      .then((response) => {
        if (response.status === 401) {
          logoutAdmin();
          return;
        }
        lastKnownStateJson = JSON.stringify(appState);
      })
      .catch((error) => console.warn("No se pudo guardar en el backend", error));
  }, 350);
}

function isAdminMode() {
  return Boolean(adminToken);
}

function requireAdmin() {
  return isAdminMode();
}

function updateAccessUi() {
  const isAdmin = isAdminMode();
  document.body.classList.toggle("is-viewer", !isAdmin);
  document.body.classList.toggle("is-admin", isAdmin);

  if (els.loginButton) {
    els.loginButton.textContent = isAdmin ? "Admin" : "Login";
    els.loginButton.title = isAdmin ? "Cerrar modo edición" : "Entrar a modo edición";
  }

  [els.teamCountInput, els.weekLimitInput, els.finalDonationInput].forEach((input) => {
    if (input) input.disabled = !isAdmin;
  });

  if (!isAdmin) {
    closeActionMenus();
    els.reportExport.hidden = true;
    els.teamEditorWrap.hidden = true;
    els.toggleNamesButton.textContent = "Editar nombres";
  }
}

function openAdminLoginModal() {
  if (!els.adminLoginModal) return;
  els.authError.hidden = true;
  els.adminPasswordInput.value = "";
  els.adminLoginModal.hidden = false;
  els.adminPasswordInput.focus();
}

function closeAdminLoginModal() {
  if (!els.adminLoginModal) return;
  els.adminLoginModal.hidden = true;
}

async function submitAdminLogin() {
  if (!window.fetch || !API_AUTH_URL) return;

  els.submitLoginButton.disabled = true;
  els.authError.hidden = true;

  try {
    const response = await fetch(API_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: els.adminPasswordInput.value }),
    });

    if (!response.ok) {
      els.authError.hidden = false;
      return;
    }

    const payload = await response.json();
    adminToken = payload.token || "";
    localStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
    closeAdminLoginModal();
    updateAccessUi();
    render();
  } catch {
    els.authError.hidden = false;
  } finally {
    els.submitLoginButton.disabled = false;
  }
}

function logoutAdmin() {
  adminToken = "";
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  closeActionMenus();
  selectedTeamId = null;
  updateAccessUi();
  render();
}

async function pollForRemoteUpdates() {
  if (!window.fetch || !API_STATE_URL || isApplyingRemoteState) return;
  if (apiSaveTimer || Date.now() - lastLocalSaveAt < LOCAL_SAVE_GRACE_MS) return;
  if (isUserActivelyEditing()) return;

  try {
    const response = await fetch(API_STATE_URL, { cache: "no-store" });
    if (!response.ok) return;

    const remotePayload = await response.json();
    if (!remotePayload) return;

    const remoteState = normalizeAppStatePayload(remotePayload.data || remotePayload);
    const remoteJson = JSON.stringify(remoteState);
    if (remoteJson === lastKnownStateJson) return;

    applyRemoteState(remoteState);
  } catch (error) {
    console.warn("No se pudo sincronizar el estado remoto", error);
  }
}

function applyRemoteState(remoteState) {
  const currentCategory = appState.activeCategory;
  const currentWeek = activeWeek;
  isApplyingRemoteState = true;
  Object.keys(appState).forEach((key) => delete appState[key]);
  Object.assign(appState, remoteState);
  appState.activeCategory = currentCategory;
  state = appState.categories[currentCategory];
  activeWeek = clamp(currentWeek, 1, state.weekLimit);
  state.activeWeek = activeWeek;
  selectedTeamId = null;
  els.reportExport.hidden = true;
  lastKnownStateJson = JSON.stringify(appState);
  render();
  isApplyingRemoteState = false;
}

function isUserActivelyEditing() {
  const activeElement = document.activeElement;
  if (!activeElement) return false;
  return ["INPUT", "SELECT", "TEXTAREA"].includes(activeElement.tagName)
    || activeElement.isContentEditable
    || selectedTeamId !== null
    || !els.finalFeeModal.hidden;
}

function getViewerId() {
  const key = "tour-viewer-id";
  const existingId = sessionStorage.getItem(key);
  if (existingId) return existingId;

  const nextId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  sessionStorage.setItem(key, nextId);
  return nextId;
}

async function sendPresenceHeartbeat() {
  if (!window.fetch || !API_PRESENCE_URL || !els.presenceDots) return;

  try {
    const response = await fetch(API_PRESENCE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viewerId }),
      keepalive: true,
    });

    if (!response.ok) return;
    const payload = await response.json();
    renderPresenceDots(Number(payload.activeViewers) || 1);
  } catch (error) {
    console.warn("No se pudo actualizar la presencia en vivo", error);
  }
}

function renderPresenceDots(count) {
  if (!els.presenceDots) return;

  const visibleDots = Math.min(count, PRESENCE_MAX_DOTS);
  els.presenceDots.innerHTML = "";
  els.presenceDots.title = `${count} persona${count === 1 ? "" : "s"} viendo en vivo`;

  Array.from({ length: visibleDots }).forEach(() => {
    const dot = document.createElement("span");
    dot.className = "presence-dot";
    els.presenceDots.append(dot);
  });

  if (count > PRESENCE_MAX_DOTS) {
    const overflow = document.createElement("span");
    overflow.className = "presence-overflow";
    overflow.textContent = `+${count - PRESENCE_MAX_DOTS}`;
    els.presenceDots.append(overflow);
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeSavedTeamName(name, index) {
  if (!name || /^Team \d+$/i.test(name)) return `Equipo ${index + 1}`;
  return name;
}

function getWeek(weekNumber = activeWeek) {
  return state.weeks[weekNumber - 1];
}

function getTeam(teamId) {
  return state.teams.find((team) => team.id === teamId);
}

function getActiveTeams() {
  return state.teams.slice(0, state.teamCount);
}

function getActiveTeamIds() {
  return new Set(getActiveTeams().map((team) => team.id));
}

function sortedTeamsForTables() {
  return getActiveTeams()
    .map((team) => ({ ...team, total: teamTotal(team.id) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

function visibleWeeks() {
  const hidden = new Set(state.hiddenWeeks || []);
  return state.weeks.slice(0, state.weekLimit).filter((week) => !hidden.has(week.week));
}

function isDoublePointsWeek(week) {
  return state.weekLimit > 1 && week.week === state.weekLimit - 1;
}

function teamScoreForWeek(teamId, week) {
  const placeIndex = week.placements.indexOf(teamId);
  if (placeIndex === -1 || placeIndex >= state.teamCount) return 0;
  return POINTS_BY_PLACE[placeIndex] * (isDoublePointsWeek(week) ? 2 : 1);
}

function teamPlaceForWeek(teamId, week) {
  const placeIndex = week.placements.indexOf(teamId);
  if (placeIndex === -1 || placeIndex >= state.teamCount) return null;
  return placeIndex;
}

function teamTotal(teamId) {
  return state.weeks
    .slice(0, state.weekLimit)
    .reduce((total, week) => total + teamScoreForWeek(teamId, week), 0);
}

function teamMoneyForWeek(teamId, week) {
  const placeIndex = teamPlaceForWeek(teamId, week);
  return placeIndex !== null && placeIndex < 3 ? prizeForPlace(placeIndex, week) : 0;
}

function teamMoneyTotal(teamId) {
  return state.weeks
    .slice(0, state.weekLimit)
    .reduce((total, week) => total + teamMoneyForWeek(teamId, week), 0);
}

function activePlacementsSet() {
  const activeIds = getActiveTeamIds();
  return new Set(getWeek().placements.filter((teamId) => activeIds.has(teamId)));
}

function activePaidSet(ids) {
  const activeIds = getActiveTeamIds();
  return new Set(ids.filter((teamId) => activeIds.has(teamId)));
}

function weekFee(week) {
  return isFinalsWeek(week) ? state.finalWeekFee : REGULAR_WEEK_FEE_DOP;
}

function paidCountForWeek(week) {
  return activePaidSet(week.paidTeamIds).size;
}

function inscriptionPaidCount() {
  return activePaidSet(state.inscriptionPaidTeamIds).size;
}

function finalPoolFromInscriptions() {
  return inscriptionPaidCount() * INSCRIPTION_FINAL_POOL_DOP;
}

function hostEarningsFromInscriptions() {
  return inscriptionPaidCount() * INSCRIPTION_HOST_EARNINGS_DOP;
}

function finalDonation() {
  return Math.max(0, Number(state.finalDonation) || 0);
}

function setPayment(list, teamId, paid) {
  const nextIds = new Set(list);
  if (paid) {
    nextIds.add(teamId);
  } else {
    nextIds.delete(teamId);
  }
  return Array.from(nextIds);
}

function render() {
  updateAccessUi();
  els.categorySelect.value = appState.activeCategory;
  els.teamCountInput.value = state.teamCount;
  els.weekLimitInput.value = state.weekLimit;
  els.finalDonationInput.value = state.finalDonation;
  renderWeekOptions();
  renderTeamEditor();
  renderPool();
  renderPlacements();
  renderStandings();
  renderPayments();
  renderReport();
  saveState();
}

function switchCategory(category) {
  if (!["A", "B"].includes(category) || category === appState.activeCategory) return;
  saveState();
  appState.activeCategory = category;
  state = appState.categories[category];
  activeWeek = state.activeWeek || 1;
  selectedTeamId = null;
  els.reportExport.hidden = true;
  render();
}

function renderWeekOptions() {
  activeWeek = clamp(activeWeek, 1, state.weekLimit);
  els.weekSelect.innerHTML = "";
  for (let index = 1; index <= state.weekLimit; index += 1) {
    const option = document.createElement("option");
    option.value = String(index);
    const labelParts = [`Semana ${index}`];
    if (index === state.weekLimit - 1 && state.weekLimit > 1) labelParts.push("(x2)");
    if (index === state.weekLimit) labelParts.push("(Final)");
    option.textContent = labelParts.join(" ");
    option.selected = index === activeWeek;
    els.weekSelect.append(option);
  }
  els.doubleToggle.checked = isDoublePointsWeek(getWeek());
  els.doubleToggle.disabled = true;
  els.placementTitle.textContent = `Resultados semana ${activeWeek}`;
  renderPrizeSubtitle();
}

function renderTeamEditor() {
  if (!isAdminMode()) {
    els.teamEditor.innerHTML = "";
    return;
  }

  els.teamEditor.innerHTML = "";
  getActiveTeams().forEach((team, index) => {
    const row = document.createElement("label");
    row.className = "team-name-row";
    row.innerHTML = `<span>${index + 1}</span>`;

    const input = document.createElement("input");
    input.value = team.name;
    input.maxLength = 32;
    input.setAttribute("aria-label", `Nombre del equipo ${index + 1}`);
    input.addEventListener("input", () => {
      if (!requireAdmin()) return;
      team.name = input.value.trimStart() || `Equipo ${index + 1}`;
      saveState();
      renderPool();
      renderPlacements();
      renderStandings();
      renderReport();
    });

    row.append(input);
    els.teamEditor.append(row);
  });
}

function renderPool() {
  const placed = activePlacementsSet();
  const availableTeams = getActiveTeams().filter((team) => !placed.has(team.id));
  els.teamPool.innerHTML = "";
  availableTeams.forEach((team) => els.teamPool.append(createTeamChip(team)));
  els.poolCount.textContent = `${availableTeams.length} disponibles`;
  els.teamPool.dataset.zoneType = "pool";
}

function renderPlacements() {
  const week = getWeek();
  const activeIds = getActiveTeamIds();
  const assignedCount = week.placements
    .slice(0, state.teamCount)
    .filter((teamId) => activeIds.has(teamId)).length;
  els.weekAssignedCount.textContent = `${assignedCount} / ${state.teamCount}`;
  els.placementGrid.innerHTML = "";

  POINTS_BY_PLACE.slice(0, state.teamCount).forEach((points, placeIndex) => {
    const card = document.createElement("article");
    const medalTone = MEDAL_TONES[placeIndex];
    card.className = `place-card drop-zone ${medalTone ? `podium-card medal-${medalTone}` : ""}`;
    card.dataset.placeIndex = String(placeIndex);
    const prizeText = placeIndex < 3 ? `<small>${formatDop(prizeForPlace(placeIndex, week))}</small>` : "";
    card.innerHTML = `
      <div class="place-rank">
        <strong>${placeLabel(placeIndex + 1)}</strong>
        <span>${points * (isDoublePointsWeek(week) ? 2 : 1)} pts${prizeText}</span>
      </div>
      <div class="place-drop"></div>
    `;

    const drop = card.querySelector(".place-drop");
    const placedTeamId = week.placements[placeIndex];
    const teamId = activeIds.has(placedTeamId) ? placedTeamId : null;
    if (teamId) {
      drop.append(createTeamChip(getTeam(teamId)));
    } else {
      const empty = document.createElement("div");
      empty.className = "empty-slot";
      empty.textContent = isAdminMode() ? "Soltar equipo" : "TBD";
      drop.append(empty);
    }

    setupDropZone(card, "place", placeIndex);
    card.addEventListener("click", () => {
      if (!requireAdmin()) return;
      if (selectedTeamId) moveTeam(selectedTeamId, "place", placeIndex);
    });
    els.placementGrid.append(card);
  });
}

function createTeamChip(team) {
  const chip = document.createElement("div");
  chip.className = "team-chip";
  chip.draggable = isAdminMode();
  chip.dataset.teamId = team.id;
  chip.textContent = team.name;
  chip.classList.toggle("is-selected", selectedTeamId === team.id);
  chip.addEventListener("dragstart", (event) => {
    if (!requireAdmin()) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData("text/plain", team.id);
    event.dataTransfer.effectAllowed = "move";
    chip.classList.add("is-dragging");
  });
  chip.addEventListener("dragend", () => chip.classList.remove("is-dragging"));
  chip.addEventListener("click", (event) => {
    if (!requireAdmin()) return;
    event.stopPropagation();
    selectedTeamId = selectedTeamId === team.id ? null : team.id;
    renderPool();
    renderPlacements();
  });
  return chip;
}

function setupDropZone(element, zoneType, placeIndex = null) {
  element.addEventListener("dragover", (event) => {
    if (!requireAdmin()) return;
    event.preventDefault();
    element.classList.add("drag-over");
  });
  element.addEventListener("dragleave", () => element.classList.remove("drag-over"));
  element.addEventListener("drop", (event) => {
    if (!requireAdmin()) return;
    event.preventDefault();
    element.classList.remove("drag-over");
    const teamId = event.dataTransfer.getData("text/plain");
    moveTeam(teamId, zoneType, placeIndex);
  });
}

function moveTeam(teamId, zoneType, placeIndex) {
  if (!requireAdmin()) return;
  if (!getActiveTeamIds().has(teamId)) return;
  const week = getWeek();
  const currentPlace = week.placements.indexOf(teamId);
  if (currentPlace !== -1) week.placements[currentPlace] = null;

  if (zoneType === "place") {
    const displacedTeamId = week.placements[placeIndex];
    week.placements[placeIndex] = teamId;
    if (displacedTeamId && currentPlace !== -1) {
      week.placements[currentPlace] = displacedTeamId;
    }
  }

  selectedTeamId = null;
  renderPool();
  renderPlacements();
  renderStandings();
  renderReport();
  saveState();
}

function renderStandings() {
  const rows = getActiveTeams()
    .map((team) => ({ ...team, total: teamTotal(team.id) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  els.standingsList.innerHTML = "";
  rows.forEach((team, index) => {
    const row = document.createElement("div");
    const medalTone = MEDAL_TONES[index];
    row.className = `standing-row ${medalTone ? `medal-${medalTone}` : ""}`;
    row.innerHTML = `
      <span class="rank">${index + 1}</span>
      <span class="name" title="${escapeHtml(team.name)}">${escapeHtml(team.name)}</span>
      <span class="points">${team.total.toLocaleString()} pts</span>
    `;
    els.standingsList.append(row);
  });
}

function renderReport() {
  const visibleReportWeeks = visibleWeeks();
  const header = `
    <thead>
      <tr>
        <th>Equipo</th>
        ${visibleReportWeeks
          .map(
            (week) =>
              `<th>Semana ${week.week}${isDoublePointsWeek(week) ? '<span class="double-badge">x2</span>' : ""}</th>`,
          )
          .join("")}
        <th>Total</th>
      </tr>
    </thead>
  `;

  const sortedTeams = sortedTeamsForTables();

  const body = sortedTeams
    .map((team) => {
      const weeklyCells = visibleReportWeeks
        .map((week) => `<td>${teamScoreForWeek(team.id, week).toLocaleString()}</td>`)
        .join("");
      return `<tr><td>${escapeHtml(team.name)}</td>${weeklyCells}<td>${team.total.toLocaleString()}</td></tr>`;
    })
    .join("");

  els.reportTable.innerHTML = `${header}<tbody>${body}</tbody>`;
}

function renderPayments() {
  const visiblePaymentWeeks = visibleWeeks();
  const activeTeams = sortedTeamsForTables();
  const inscriptionPaid = activePaidSet(state.inscriptionPaidTeamIds);
  els.showWeeksButton.disabled = !state.hiddenWeeks?.length;

  const header = `
    <thead>
      <tr>
        <th>Equipo</th>
        <th>Inscripción<br><span>${formatDop(INSCRIPTION_FEE_DOP)}</span></th>
        ${visiblePaymentWeeks
          .map((week) => {
            const paymentText = isFinalsWeek(week)
              ? `<button class="amount-link" type="button" data-action="edit-final-fee">${formatDop(weekFee(week))}</button>`
              : formatDop(weekFee(week));
            const hideButton = isAdminMode()
              ? `<button class="week-hide-button" type="button" data-action="hide-week" data-week="${week.week}" title="Ocultar semana ${week.week}">Ocultar</button>`
              : "";
            return `<th><div class="week-pay-head"><span>Semana ${week.week}</span><span class="week-pay-amount">${paymentText}</span>${hideButton}</div></th>`;
          })
          .join("")}
      </tr>
    </thead>
  `;

  const body = activeTeams
    .map((team) => {
      const weeklyCells = visiblePaymentWeeks
        .map((week) => {
          const paid = activePaidSet(week.paidTeamIds).has(team.id);
          return `<td><input class="payment-check" type="checkbox" data-payment-type="week" data-week="${week.week}" data-team-id="${team.id}" ${
            paid ? "checked" : ""
          } aria-label="${escapeHtml(team.name)} pagó semana ${week.week}" /></td>`;
        })
        .join("");

      return `
        <tr>
          <td>${escapeHtml(team.name)}</td>
          <td><input class="payment-check" type="checkbox" data-payment-type="inscription" data-team-id="${team.id}" ${
            inscriptionPaid.has(team.id) ? "checked" : ""
          } aria-label="${escapeHtml(team.name)} pagó inscripción" /></td>
          ${weeklyCells}
        </tr>
      `;
    })
    .join("");

  const activeWeekPool = prizePool(getWeek());
  const totalPaid = totalCollected();
  const activeWeekSummary = isFinalsWeek(getWeek())
    ? `Semana final: ${paidCountForWeek(getWeek())} pagos x ${formatDop(state.finalWeekFee)}, bolsa ${formatDop(activeWeekPool)}`
    : `Semana ${activeWeek}: ${paidCountForWeek(getWeek())} pagos, bolsa ${formatDop(activeWeekPool)}`;
  els.paymentSummary.textContent = `${inscriptionPaidCount()} inscripciones pagadas: ${formatDop(
    finalPoolFromInscriptions(),
  )} al pool final y ${formatDop(hostEarningsFromInscriptions())} para el host | Donación final: ${formatDop(
    finalDonation(),
  )} | ${activeWeekSummary} | Total recibido: ${formatDop(
    totalPaid,
  )}`;
  els.paymentTable.innerHTML = `${header}<tbody>${body}</tbody>`;
}

function isFinalsWeek(week) {
  return week.week === state.weekLimit;
}

function prizePool(week = getWeek()) {
  if (isFinalsWeek(week)) return finalPoolFromInscriptions() + paidCountForWeek(week) * state.finalWeekFee + finalDonation();
  return paidCountForWeek(week) * REGULAR_WEEK_FEE_DOP;
}

function totalCollected() {
  const weeklyTotal = state.weeks
    .slice(0, state.weekLimit)
    .reduce((total, week) => total + paidCountForWeek(week) * weekFee(week), 0);
  return weeklyTotal + inscriptionPaidCount() * INSCRIPTION_FEE_DOP + finalDonation();
}

function prizeForPlace(placeIndex, week = getWeek()) {
  return Math.round(prizePool(week) * [0.5, 0.3, 0.2][placeIndex]);
}

function formatDop(value) {
  return `DOP ${value.toLocaleString("en-US")}`;
}

function downloadDataFile() {
  if (!requireAdmin()) return;
  saveState();
  const payload = {
    project: "Tour Virtual Banreservas",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: appState,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const dateStamp = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `tour-virtual-banreservas-datos-${dateStamp}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function importDataFile(event) {
  if (!requireAdmin()) return;
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const parsed = JSON.parse(String(reader.result || "{}"));
      const importedState = normalizeAppStatePayload(parsed.data || parsed);
      appState.activeCategory = importedState.activeCategory;
      appState.categories = importedState.categories;
      state = appState.categories[appState.activeCategory];
      activeWeek = state.activeWeek || 1;
      selectedTeamId = null;
      els.reportExport.hidden = true;
      render();
    } catch {
      alert("No se pudo cargar el archivo. Revisa que sea un JSON exportado desde esta aplicación.");
    }
  });
  reader.readAsText(file);
}

function renderPrizeSubtitle() {
  const week = getWeek();
  const poolDescription = isFinalsWeek(week)
    ? `Semana final: ${inscriptionPaidCount()} inscripciones x ${formatDop(
        INSCRIPTION_FINAL_POOL_DOP,
      )} + ${paidCountForWeek(week)} pagos x ${formatDop(state.finalWeekFee)} + donación ${formatDop(
        finalDonation(),
      )} = ${formatDop(prizePool(week))} en bolsa`
    : `Semana regular: ${paidCountForWeek(week)} pagos x ${formatDop(REGULAR_WEEK_FEE_DOP)} = ${formatDop(
        prizePool(week),
      )} en bolsa`;
  els.prizeSubtitle.textContent = `${poolDescription} | 1ro ${formatDop(prizeForPlace(0, week))} | 2do ${formatDop(
    prizeForPlace(1, week),
  )} | 3ro ${formatDop(prizeForPlace(2, week))}`;
}

function ordinal(number) {
  if ([11, 12, 13].includes(number % 100)) return "th";
  return { 1: "st", 2: "nd", 3: "rd" }[number % 10] || "th";
}

function placeLabel(number) {
  return { 1: "1ro", 2: "2do", 3: "3ro" }[number] || `${number}to`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return entities[char];
  });
}

function getReportTeams(activeReportWeek, mode) {
  const overallSorted = getActiveTeams()
    .map((team) => ({
      ...team,
      total: teamTotal(team.id),
      weekPoints: teamScoreForWeek(team.id, activeReportWeek),
      weekPlace: teamPlaceForWeek(team.id, activeReportWeek),
      weekMoney: teamMoneyForWeek(team.id, activeReportWeek),
      totalMoney: teamMoneyTotal(team.id),
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .map((team, index) => ({ ...team, overallPlace: index + 1 }));

  if (mode === "week") {
    return [...overallSorted].sort((a, b) => {
      const placeA = a.weekPlace === null ? Number.MAX_SAFE_INTEGER : a.weekPlace;
      const placeB = b.weekPlace === null ? Number.MAX_SAFE_INTEGER : b.weekPlace;
      return placeA - placeB || b.weekPoints - a.weekPoints || a.name.localeCompare(b.name);
    });
  }

  return overallSorted;
}

async function downloadReportImage(mode = "week") {
  if (!requireAdmin()) return;
  try {
    els.reportExport.hidden = false;
    els.reportExportStatus.textContent = "Generando imagen del reporte...";

  const activeReportWeek = getWeek();
  const sortedTeams = getReportTeams(activeReportWeek, mode);
  const isOverallReport = mode === "overall";
  const reportLogo = await loadImage(LOGO_SRC);

  const scale = 2;
  const size = 1600;
  const width = size;
  const height = size;
  const outerPadding = 72;

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#004f36");
  background.addColorStop(0.56, "#006747");
  background.addColorStop(1, "#00563c");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(130, 77, 43, 0.28)";
  ctx.beginPath();
  ctx.arc(width - 140, 40, 290, 0, Math.PI * 2);
  ctx.fill();

  drawRoundRect(ctx, outerPadding, 48, width - outerPadding * 2, 160, 28, "#f3ebd4");
  drawReportLogo(ctx, outerPadding + 34, 72, 112, 96, reportLogo);
  ctx.fillStyle = "#006747";
  ctx.font = "900 44px Inter, Arial, sans-serif";
  ctx.fillText(`Tour Virtual Banreservas - Categoría ${appState.activeCategory}`, outerPadding + 166, 108);
  ctx.font = "900 27px Inter, Arial, sans-serif";
  const reportTitle = isOverallReport ? "Reporte overall" : `Lugares semana ${activeWeek}${isFinalsWeek(activeReportWeek) ? " final" : ""}`;
  ctx.fillText(reportTitle, outerPadding + 166, 148);
  ctx.fillStyle = "#824d2b";
  ctx.font = "800 18px Inter, Arial, sans-serif";
    const poolSource = isFinalsWeek(activeReportWeek)
      ? `${inscriptionPaidCount()} inscripciones + ${paidCountForWeek(activeReportWeek)} pagos final + donación`
      : `${paidCountForWeek(activeReportWeek)} pagos semana`;
    const payoutLine = `${poolSource} | ${formatDop(prizePool(activeReportWeek))} en bolsa | 1ro ${formatDop(
      prizeForPlace(0, activeReportWeek),
    )} | 2do ${formatDop(prizeForPlace(1, activeReportWeek))} | 3ro ${formatDop(prizeForPlace(2, activeReportWeek))}`;
  ctx.fillText(truncateText(ctx, payoutLine, width - outerPadding * 2 - 190), outerPadding + 166, 176);

  const first = sortedTeams[0];
  const second = sortedTeams[1];
  const third = sortedTeams[2];
  const podiumTop = 236;
  if (first) drawPodiumCard(ctx, 250, podiumTop, 1100, 276, first, 1, "gold", mode);
  if (second) drawPodiumCard(ctx, 128, podiumTop + 322, 644, 248, second, 2, "silver", mode);
  if (third) drawPodiumCard(ctx, 828, podiumTop + 322, 644, 248, third, 3, "bronze", mode);

  const otherTeams = sortedTeams.slice(3);
  const otherStartY = 852;
  const otherGap = 12;
  const otherWidth = width - outerPadding * 2;
  const otherRows = Math.max(1, otherTeams.length);
  const otherHeight = Math.min(70, (height - otherStartY - 104 - otherGap * (otherRows - 1)) / otherRows);

  drawReportRowHeader(ctx, outerPadding, otherStartY - 34, otherWidth, mode);
  otherTeams.forEach((team, index) => {
    const y = otherStartY + index * (otherHeight + otherGap);
    drawCompactReportRow(ctx, outerPadding, y, otherWidth, otherHeight, team, index + 4, mode);
  });

  ctx.fillStyle = "rgba(243, 235, 212, 0.82)";
  ctx.font = "800 15px Inter, Arial, sans-serif";
  ctx.fillText(
    isOverallReport
      ? "Reporte overall. Ordenado por puntos acumulados. Se muestra solo el dinero total ganado."
      : "Reporte semanal. Ordenado por lugares de la semana. Se muestra dinero de la semana y dinero total.",
    outerPadding,
    height - 34,
  );

    const imageUrl = canvas.toDataURL("image/png");
    const fileName = isOverallReport
      ? `reporte-tour-virtual-categoria-${appState.activeCategory}-overall-semana-${activeWeek}.png`
      : `reporte-tour-virtual-categoria-${appState.activeCategory}-lugares-semana-${activeWeek}.png`;

  els.reportPreview.src = imageUrl;
  els.reportDownloadLink.href = imageUrl;
  els.reportDownloadLink.download = fileName;
  els.reportExportStatus.textContent = "Imagen del reporte lista";

    els.reportDownloadLink.click();
    els.reportExport.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    console.error(error);
    els.reportExport.hidden = false;
    els.reportExportStatus.textContent = `No se pudo generar el PNG con el logo: ${error.message || error}`;
  }
}

function drawPodiumCard(ctx, x, y, width, height, team, reportPlace, tone, mode) {
  const palette = {
    gold: ["#fff4b8", "#d8a928", "#8f6500"],
    silver: ["#f7f7f2", "#b8bec4", "#606873"],
    bronze: ["#f0bf94", "#b66a35", "#6f3618"],
  }[tone];
  const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, palette[0]);
  gradient.addColorStop(1, palette[1]);
  drawRoundRect(ctx, x, y, width, height, 30, gradient);
  ctx.strokeStyle = palette[2];
  ctx.lineWidth = 4;
  strokeRoundRect(ctx, x, y, width, height, 30);

  const cardInset = reportPlace === 1 ? 30 : 28;
  const badgeWidth = reportPlace === 1 ? 104 : 96;
  const badgeHeight = reportPlace === 1 ? 86 : 82;
  const contentX = x + cardInset + badgeWidth + 22;

  drawRoundRect(ctx, x + cardInset, y + cardInset, badgeWidth, badgeHeight, 20, "#006747");
  ctx.fillStyle = "#f3ebd4";
  ctx.font = reportPlace === 1 ? "900 42px Inter, Arial, sans-serif" : "900 38px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`#${reportPlace}`, x + cardInset + badgeWidth / 2, y + cardInset + badgeHeight / 2);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#2d2d2d";
  ctx.font = reportPlace === 1 ? "900 52px Inter, Arial, sans-serif" : "900 40px Inter, Arial, sans-serif";
  ctx.fillText(truncateText(ctx, team.name, width - (contentX - x) - cardInset), contentX, y + (reportPlace === 1 ? 74 : 72));
  ctx.fillStyle = palette[2];
  ctx.font = "900 21px Inter, Arial, sans-serif";
  const subtitle =
    mode === "overall"
      ? `${placeLabel(reportPlace)} overall`
      : `${placeLabel(reportPlace)} semana | ${placeLabel(team.overallPlace)} overall`;
  ctx.fillText(subtitle, contentX + 4, y + (reportPlace === 1 ? 110 : 108));

  const weekPlaceText =
    team.weekPlace === null ? "Sin posición" : placeLabel(team.weekPlace + 1);
  const metrics = [
    ["Puntos semana", `${team.weekPoints.toLocaleString()} pts`],
    ["Lugar semana", weekPlaceText],
    ["Dinero total", formatDop(team.totalMoney)],
  ];
  if (mode === "week") {
    metrics.splice(2, 0, ["Dinero semana", formatDop(team.weekMoney)]);
  } else {
    metrics.splice(0, 2, ["Puntos totales", `${team.total.toLocaleString()} pts`]);
  }
  const metricTop = width < 800 ? y + height - 114 : y + height - 118;
  const metricHeight = width < 800 ? 90 : 88;
  drawMetricGrid(ctx, x + cardInset, metricTop, width - cardInset * 2, metricHeight, metrics, true);
}

function drawReportRowHeader(ctx, x, y, width, mode) {
  drawRoundRect(ctx, x, y, width, 32, 12, "rgba(243, 235, 212, 0.2)");
  const columns = reportRowColumns(width, mode);
  ctx.fillStyle = "rgba(243, 235, 212, 0.82)";
  ctx.font = "900 13px Inter, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const labels = [
    ["Rango", columns.rank],
    ["Equipo", columns.name],
    ["Dinero total", columns.totalMoney],
  ];
  if (mode === "week") {
    labels.splice(2, 0, ["Pts semana", columns.weekPoints], ["Lugar", columns.weekPlace], ["Dinero semana", columns.weekMoney]);
  } else {
    labels.splice(2, 0, ["Pts totales", columns.weekPoints]);
  }
  labels.forEach(([label, column]) => {
    ctx.fillText(label.toUpperCase(), x + column.x, y + 17);
  });
}

function drawCompactReportRow(ctx, x, y, width, height, team, reportPlace, mode) {
  drawRoundRect(ctx, x, y, width, height, 18, "#f3ebd4");
  ctx.strokeStyle = "#824d2b";
  ctx.lineWidth = 1.5;
  strokeRoundRect(ctx, x, y, width, height, 18);

  const columns = reportRowColumns(width, mode);
  const centerY = y + height / 2;
  const weekPlaceText =
    team.weekPlace === null ? "Sin posición" : placeLabel(team.weekPlace + 1);

  const rankHeight = Math.max(36, height - 26);
  drawRoundRect(ctx, x + columns.rank.x, y + (height - rankHeight) / 2, 60, rankHeight, 12, "#006747");
  ctx.fillStyle = "#f3ebd4";
  ctx.font = "900 23px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`#${reportPlace}`, x + columns.rank.x + 30, centerY);

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#2d2d2d";
  ctx.font = "900 24px Inter, Arial, sans-serif";
  ctx.fillText(truncateText(ctx, team.name, columns.name.width), x + columns.name.x, centerY);

  ctx.font = "900 22px Inter, Arial, sans-serif";
  if (mode === "overall") {
    ctx.fillText(`${team.total.toLocaleString()} pts`, x + columns.weekPoints.x, centerY);
  } else {
    ctx.fillText(`${team.weekPoints.toLocaleString()} pts`, x + columns.weekPoints.x, centerY);
    ctx.fillText(weekPlaceText, x + columns.weekPlace.x, centerY);
  }

  if (mode === "week") {
    ctx.fillStyle = "#006747";
    ctx.fillText(formatDop(team.weekMoney), x + columns.weekMoney.x, centerY);
  }

  const moneyHeight = Math.max(36, height - 26);
  drawRoundRect(ctx, x + columns.totalMoney.x - 14, y + (height - moneyHeight) / 2, columns.totalMoney.width, moneyHeight, 12, "#006747");
  ctx.fillStyle = "#f3ebd4";
  ctx.font = "900 21px Inter, Arial, sans-serif";
  ctx.fillText(formatDop(team.totalMoney), x + columns.totalMoney.x, centerY);
}

function reportRowColumns(width, mode) {
  if (mode === "overall") {
    return {
      rank: { x: 18, width: 72 },
      name: { x: 108, width: width * 0.34 },
      weekPoints: { x: width * 0.5, width: width * 0.14 },
      weekPlace: { x: width * 0.64, width: width * 0.14 },
      weekMoney: { x: width * 0.68, width: 0 },
      totalMoney: { x: width * 0.8, width: width * 0.19 },
    };
  }

  return {
    rank: { x: 18, width: 72 },
    name: { x: 108, width: width * 0.29 },
    weekPoints: { x: width * 0.43, width: width * 0.13 },
    weekPlace: { x: width * 0.56, width: width * 0.12 },
    weekMoney: { x: width * 0.68, width: width * 0.15 },
    totalMoney: { x: width * 0.84, width: width * 0.15 },
  };
}

function drawMetricGrid(ctx, x, y, width, height, metrics, isPodium) {
  if (isPodium && width < 700 && metrics.length === 4) {
    const gap = 10;
    const columns = 2;
    const rows = 2;
    const cellWidth = (width - gap) / columns;
    const cellHeight = (height - gap) / rows;
    metrics.forEach(([label, value], index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const metricX = x + column * (cellWidth + gap);
      const metricY = y + row * (cellHeight + gap);
      const isMoneyTotal = label === "Dinero total";
      drawRoundRect(ctx, metricX, metricY, cellWidth, cellHeight, 12, isMoneyTotal ? "#006747" : "rgba(243, 235, 212, 0.82)");
      ctx.fillStyle = isMoneyTotal ? "#f3ebd4" : "#6b5a4c";
      ctx.font = "900 10px Inter, Arial, sans-serif";
      ctx.fillText(label.toUpperCase(), metricX + 12, metricY + 16);
      ctx.fillStyle = isMoneyTotal ? "#f3ebd4" : "#2d2d2d";
      ctx.font = "900 18px Inter, Arial, sans-serif";
      ctx.fillText(truncateText(ctx, value, cellWidth - 24), metricX + 12, metricY + 37);
    });
    return;
  }

  const metricGap = 10;
  const metricWidth = (width - metricGap * (metrics.length - 1)) / metrics.length;
  metrics.forEach(([label, value], index) => {
    const metricX = x + index * (metricWidth + metricGap);
    const isMoneyTotal = label === "Dinero total";
    drawRoundRect(ctx, metricX, y, metricWidth, height, 12, isMoneyTotal ? "#006747" : "rgba(243, 235, 212, 0.82)");
    ctx.fillStyle = isMoneyTotal ? "#f3ebd4" : "#6b5a4c";
    ctx.font = isPodium ? "900 12px Inter, Arial, sans-serif" : "900 10px Inter, Arial, sans-serif";
    ctx.fillText(label.toUpperCase(), metricX + 12, y + (isPodium ? 26 : 20));
    ctx.fillStyle = isMoneyTotal ? "#f3ebd4" : "#2d2d2d";
    ctx.font = isPodium ? "900 24px Inter, Arial, sans-serif" : "900 17px Inter, Arial, sans-serif";
    ctx.fillText(truncateText(ctx, value, metricWidth - 24), metricX + 12, y + (isPodium ? 60 : 43));
  });
}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "sync";
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error(`No se pudo cargar la imagen: ${src}`)), { once: true });
    image.src = src;
    if (image.complete && image.naturalWidth > 0) resolve(image);
  });
}

function drawReportLogo(ctx, x, y, width, height, image = null) {
  if (!image) throw new Error("HOYO 20 logo could not be loaded.");
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const boxRatio = width / height;
  const drawWidth = imageRatio > boxRatio ? width : height * imageRatio;
  const drawHeight = imageRatio > boxRatio ? width / imageRatio : height;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function drawRoundRect(ctx, x, y, width, height, radius, fillStyle) {
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.fill();
}

function strokeRoundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.stroke();
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function truncateText(ctx, text, maxWidth) {
  const value = String(text);
  if (ctx.measureText(value).width <= maxWidth) return value;
  let output = value;
  while (output.length > 1 && ctx.measureText(`${output}...`).width > maxWidth) {
    output = output.slice(0, -1);
  }
  return `${output}...`;
}

function handleWeekLimitChange() {
  if (!requireAdmin()) return;
  state.weekLimit = clamp(Number(els.weekLimitInput.value) || MAX_WEEKS, 1, MAX_WEEKS);
  activeWeek = clamp(activeWeek, 1, state.weekLimit);
  state.activeWeek = activeWeek;
  render();
}

function handleTeamCountChange() {
  if (!requireAdmin()) return;
  state.teamCount = clamp(Number(els.teamCountInput.value) || MAX_TEAMS, MIN_TEAMS, MAX_TEAMS);
  selectedTeamId = null;
  render();
}

function handleFinalDonationChange() {
  if (!requireAdmin()) return;
  state.finalDonation = Math.max(0, Number(els.finalDonationInput.value) || 0);
  renderPlacements();
  renderStandings();
  renderPayments();
  renderReport();
  renderPrizeSubtitle();
  saveState();
}

function hideWeek(weekNumber) {
  if (!requireAdmin()) return;
  state.hiddenWeeks = normalizeHiddenWeeks([...(state.hiddenWeeks || []), weekNumber]);
  renderPayments();
  renderReport();
  renderWeekOptions();
  saveState();
}

function showAllWeeks() {
  if (!requireAdmin()) return;
  state.hiddenWeeks = [];
  renderPayments();
  renderReport();
  renderWeekOptions();
  saveState();
}

function openFinalFeeModal() {
  if (!requireAdmin()) return;
  els.finalFeeModalInput.value = state.finalWeekFee;
  els.finalFeeModal.hidden = false;
  els.finalFeeModalInput.focus();
  els.finalFeeModalInput.select();
}

function closeFinalFeeModal() {
  els.finalFeeModal.hidden = true;
}

function saveFinalFee() {
  if (!requireAdmin()) return;
  state.finalWeekFee = Math.max(0, Number(els.finalFeeModalInput.value) || 0);
  closeFinalFeeModal();
  renderPlacements();
  renderStandings();
  renderPayments();
  renderReport();
  renderPrizeSubtitle();
  saveState();
}

function handlePaymentChange(event) {
  if (!requireAdmin()) return;
  const checkbox = event.target.closest(".payment-check");
  if (!checkbox) return;

  const teamId = checkbox.dataset.teamId;
  if (!getActiveTeamIds().has(teamId)) return;

  if (checkbox.dataset.paymentType === "inscription") {
    state.inscriptionPaidTeamIds = setPayment(state.inscriptionPaidTeamIds, teamId, checkbox.checked);
  } else {
    const week = state.weeks[Number(checkbox.dataset.week) - 1];
    if (!week) return;
    week.paidTeamIds = setPayment(week.paidTeamIds, teamId, checkbox.checked);
  }

  renderPlacements();
  renderStandings();
  renderPayments();
  renderReport();
  renderPrizeSubtitle();
  saveState();
}

function handlePaymentClick(event) {
  if (!requireAdmin()) return;
  const hideWeekButton = event.target.closest('[data-action="hide-week"]');
  if (hideWeekButton) {
    hideWeek(Number(hideWeekButton.dataset.week));
    return;
  }

  const amountButton = event.target.closest('[data-action="edit-final-fee"]');
  if (amountButton) openFinalFeeModal();
}

function closeActionMenus(exceptMenu = null) {
  document.querySelectorAll(".action-menu[open]").forEach((menu) => {
    if (menu !== exceptMenu) menu.removeAttribute("open");
  });
}

els.categorySelect.addEventListener("change", () => switchCategory(els.categorySelect.value));

els.weekLimitInput.addEventListener("input", handleWeekLimitChange);
els.weekLimitInput.addEventListener("change", handleWeekLimitChange);

els.teamCountInput.addEventListener("input", handleTeamCountChange);
els.teamCountInput.addEventListener("change", handleTeamCountChange);

els.finalDonationInput.addEventListener("input", handleFinalDonationChange);
els.finalDonationInput.addEventListener("change", handleFinalDonationChange);
els.showWeeksButton.addEventListener("click", showAllWeeks);
els.paymentTable.addEventListener("change", handlePaymentChange);
els.paymentTable.addEventListener("click", handlePaymentClick);

els.cancelFinalFeeButton.addEventListener("click", closeFinalFeeModal);
els.saveFinalFeeButton.addEventListener("click", saveFinalFee);
els.finalFeeModal.addEventListener("click", (event) => {
  if (event.target === els.finalFeeModal) closeFinalFeeModal();
});
els.finalFeeModalInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") saveFinalFee();
  if (event.key === "Escape") closeFinalFeeModal();
});

els.loginButton.addEventListener("click", () => {
  if (isAdminMode()) {
    logoutAdmin();
  } else {
    openAdminLoginModal();
  }
});

els.cancelLoginButton.addEventListener("click", closeAdminLoginModal);
els.submitLoginButton.addEventListener("click", submitAdminLogin);
els.adminLoginModal.addEventListener("click", (event) => {
  if (event.target === els.adminLoginModal) closeAdminLoginModal();
});
els.adminPasswordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") submitAdminLogin();
  if (event.key === "Escape") closeAdminLoginModal();
});

document.querySelectorAll(".action-menu").forEach((menu) => {
  menu.addEventListener("toggle", () => {
    if (menu.open) closeActionMenus(menu);
  });
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".action-menu")) closeActionMenus();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeActionMenus();
    closeFinalFeeModal();
    closeAdminLoginModal();
  }
});

els.weekSelect.addEventListener("change", () => {
  activeWeek = Number(els.weekSelect.value);
  state.activeWeek = activeWeek;
  render();
});

els.doubleToggle.addEventListener("change", () => {
  els.doubleToggle.checked = isDoublePointsWeek(getWeek());
  renderPlacements();
  renderStandings();
  renderReport();
});

els.clearWeekButton.addEventListener("click", () => {
  if (!requireAdmin()) return;
  getWeek().placements = Array(MAX_TEAMS).fill(null);
  renderPool();
  renderPlacements();
  renderStandings();
  renderReport();
  saveState();
});

els.resetButton.addEventListener("click", () => {
  if (!requireAdmin()) return;
  if (!confirm(`¿Reiniciar todos los datos de la categoría ${appState.activeCategory}?`)) return;
  state = createCategoryState();
  appState.categories[appState.activeCategory] = state;
  activeWeek = 1;
  selectedTeamId = null;
  els.reportExport.hidden = true;
  render();
});

els.exportDataButton.addEventListener("click", downloadDataFile);

els.importDataButton.addEventListener("click", () => {
  if (!requireAdmin()) return;
  els.importDataInput.click();
});

els.importDataInput.addEventListener("change", importDataFile);

els.restoreNamesButton.addEventListener("click", () => {
  if (!requireAdmin()) return;
  state.teams = structuredClone(defaultTeams);
  render();
});

els.toggleNamesButton.addEventListener("click", () => {
  if (!requireAdmin()) return;
  const isHidden = els.teamEditorWrap.hidden;
  els.teamEditorWrap.hidden = !isHidden;
  els.toggleNamesButton.textContent = isHidden ? "Ocultar nombres" : "Editar nombres";
});

els.downloadWeekButton.addEventListener("click", () => downloadReportImage("week"));
els.downloadOverallButton.addEventListener("click", () => downloadReportImage("overall"));
setupDropZone(els.teamPool, "pool");
els.teamPool.addEventListener("click", () => {
  if (!requireAdmin()) return;
  if (selectedTeamId) moveTeam(selectedTeamId, "pool");
});

render();
window.setInterval(pollForRemoteUpdates, SYNC_POLL_INTERVAL_MS);
sendPresenceHeartbeat();
window.setInterval(sendPresenceHeartbeat, PRESENCE_HEARTBEAT_INTERVAL_MS);
