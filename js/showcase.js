import { db, collection, query, orderBy, onSnapshot } from "./firebase-config.js";

const grid = document.getElementById("showcaseGrid");
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightboxImg");
const lightboxClose = document.getElementById("lightboxClose");

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

const showcaseRef = collection(db, "showcase");
const q = query(showcaseRef, orderBy("uploadedAt", "desc"));

onSnapshot(q, (snap) => {
  if (snap.empty) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        No photos or videos have been added yet. Check back soon!
      </div>`;
    return;
  }

  grid.innerHTML = snap.docs
    .map((d) => {
      const item = d.data();
      if (item.type === "video") {
        return `
          <a class="showcase-item" href="${item.mediaUrl}" target="_blank" rel="noopener">
            <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--blueprint);">
              <span class="play-icon">▶</span>
            </div>
            <span class="video-badge">VIDEO</span>
            <div class="caption">${escapeHtml(item.title)}</div>
          </a>`;
      }
      return `
        <div class="showcase-item" data-img="${item.mediaUrl}">
          <img src="${item.mediaUrl}" alt="${escapeHtml(item.title)}" loading="lazy">
          <div class="caption">${escapeHtml(item.title)}</div>
        </div>`;
    })
    .join("");

  grid.querySelectorAll(".showcase-item[data-img]").forEach((el) => {
    el.addEventListener("click", () => {
      lightboxImg.src = el.dataset.img;
      lightboxImg.style.display = "block";
      lightbox.style.display = "flex";
    });
  });
});

lightboxClose.addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox();
});
function closeLightbox() {
  lightbox.style.display = "none";
  lightboxImg.src = "";
}
