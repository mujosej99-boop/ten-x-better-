import {
  db, collection, getDocs, query, where, orderBy, doc, onSnapshot, STATUS_LABELS,
} from "./firebase-config.js";

const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const searchResults = document.getElementById("searchResults");
const searchView = document.getElementById("searchView");
const detailView = document.getElementById("detailView");
const detailContent = document.getElementById("detailContent");
const backToSearch = document.getElementById("backToSearch");

let unsubscribeApp = null;
let unsubscribeProgress = null;

async function runSearch() {
  const value = searchInput.value.trim();
  if (!value) return;

  searchResults.innerHTML = '<div class="loader"></div>';

  try {
    const appsRef = collection(db, "applications");
    const phoneQuery = query(appsRef, where("phoneNumber", "==", value));
    const nrcQuery = query(appsRef, where("nrcNumber", "==", value));

    const [phoneSnap, nrcSnap] = await Promise.all([getDocs(phoneQuery), getDocs(nrcQuery)]);

    const resultsMap = new Map();
    phoneSnap.forEach((d) => resultsMap.set(d.id, { id: d.id, ...d.data() }));
    nrcSnap.forEach((d) => resultsMap.set(d.id, { id: d.id, ...d.data() }));

    const results = Array.from(resultsMap.values());

    if (results.length === 0) {
      searchResults.innerHTML = `
        <div class="empty-state">
          No application found with that number. Please check and try again.
        </div>`;
      return;
    }

    searchResults.innerHTML = results
      .map(
        (app) => `
      <div class="result-card" data-id="${app.id}">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
          <div>
            <h3 style="margin-bottom:4px;">${escapeHtml(app.applicantName)}</h3>
            <div style="color:var(--ink-soft); font-size:13.5px;">${escapeHtml(app.projectType)} • ${escapeHtml(app.location)}</div>
          </div>
          <span class="status-badge status-${app.status}">${STATUS_LABELS[app.status] || app.status}</span>
        </div>
      </div>`
      )
      .join("");

    searchResults.querySelectorAll(".result-card").forEach((card) => {
      card.addEventListener("click", () => openDetail(card.dataset.id));
    });
  } catch (err) {
    searchResults.innerHTML = `<div class="empty-state">Search failed: ${err.message}</div>`;
  }
}

searchBtn.addEventListener("click", runSearch);
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runSearch();
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

const STATUS_STEPS = ["submitted", "under_review", "accepted", "in_progress", "completed"];

function openDetail(appId) {
  searchView.style.display = "none";
  detailView.style.display = "block";
  detailContent.innerHTML = '<div class="loader"></div>';

  if (unsubscribeApp) unsubscribeApp();
  if (unsubscribeProgress) unsubscribeProgress();

  const appRef = doc(db, "applications", appId);
  unsubscribeApp = onSnapshot(appRef, (snap) => {
    if (!snap.exists()) {
      detailContent.innerHTML = '<div class="empty-state">Application not found.</div>';
      return;
    }
    renderDetail(appId, { id: snap.id, ...snap.data() });
  });
}

function renderDetail(appId, app) {
  const currentIndex = STATUS_STEPS.indexOf(app.status);

  const progressSteps = STATUS_STEPS.map(
    (step, i) => `
    <div class="progress-step ${i <= currentIndex ? "done" : ""}">
      <div class="line"></div>
      <div class="dot">${i <= currentIndex ? "✓" : ""}</div>
      <span class="label">${STATUS_LABELS[step]}</span>
    </div>`
  ).join("");

  const noticeHtml =
    app.notice && app.notice.trim()
      ? `<div class="notice-banner">⚠ ${escapeHtml(app.notice)}</div>`
      : "";

  let bodyExtra = "";
  if (app.status === "submitted" || app.status === "under_review") {
    bodyExtra = `
      <div class="empty-state">
        ${
          app.status === "submitted"
            ? "Your document is being received."
            : "Your document is under review. We will notify you once accepted."
        }
      </div>`;
  } else {
    bodyExtra = `
      <h3 style="margin:30px 0 14px;">Build Progress</h3>
      <div id="progressList"><div class="loader"></div></div>`;
  }

  detailContent.innerHTML = `
    <div class="card" style="background:var(--white);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
        <div>
          <h2 style="margin-bottom:4px;">${escapeHtml(app.applicantName)}</h2>
          <div style="color:var(--ink-soft); font-size:14px;">${escapeHtml(app.projectType)} • ${escapeHtml(app.location)}</div>
        </div>
        <span class="status-badge status-${app.status}">${STATUS_LABELS[app.status] || app.status}</span>
      </div>
      ${noticeHtml}
      <div class="progress-track">${progressSteps}</div>
      ${bodyExtra}
    </div>
  `;

  if (app.status !== "submitted" && app.status !== "under_review") {
    loadProgressUpdates(appId);
  }
}

function loadProgressUpdates(appId) {
  const progressListEl = document.getElementById("progressList");
  if (!progressListEl) return;

  const progressRef = collection(db, "applications", appId, "progress_updates");
  const q = query(progressRef, orderBy("postedAt", "desc"));

  if (unsubscribeProgress) unsubscribeProgress();
  unsubscribeProgress = onSnapshot(q, (snap) => {
    if (snap.empty) {
      progressListEl.innerHTML = `
        <div class="empty-state">
          Your application has been accepted. Progress updates and photos will appear here once building begins.
        </div>`;
      return;
    }
    progressListEl.innerHTML = snap.docs
      .map((d) => {
        const u = d.data();
        const date = u.postedAt ? new Date(u.postedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
        return `
        <div class="update-card">
          ${u.imageUrl ? `<img src="${u.imageUrl}" alt="Progress photo">` : ""}
          <div class="body">
            <p style="margin:0 0 8px;">${escapeHtml(u.note)}</p>
            <div class="meta">
              <span>${u.daysRemaining} day(s) remaining</span>
              <span>${date}</span>
            </div>
          </div>
        </div>`;
      })
      .join("");
  });
}

backToSearch.addEventListener("click", () => {
  detailView.style.display = "none";
  searchView.style.display = "block";
  if (unsubscribeApp) unsubscribeApp();
  if (unsubscribeProgress) unsubscribeProgress();
});
