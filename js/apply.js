import { db, collection, addDoc, uploadToCloudinary } from "./firebase-config.js";

let currentStep = 0;
const totalSteps = 5;

// ---------- state for chip selections & files ----------
const state = {
  preferredContactMethod: "Phone Call",
  hasPlot: null,
  hasRoadAccess: true,
  hasDrawing: "Yes",
  additionalStructures: [],
  nrcFrontFile: null,
  nrcBackFile: null,
  planFile: null,
};

// ---------- chip helpers ----------
function setupSingleChip(containerId, stateKey, transform = (v) => v) {
  const container = document.getElementById(containerId);
  container.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      container.querySelectorAll(".chip").forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
      state[stateKey] = transform(chip.dataset.value);
      onStateChange();
    });
  });
}

function setupMultiChip(containerId, stateKey) {
  const container = document.getElementById(containerId);
  container.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      chip.classList.toggle("selected");
      const val = chip.dataset.value;
      if (chip.classList.contains("selected")) {
        state[stateKey].push(val);
      } else {
        state[stateKey] = state[stateKey].filter((v) => v !== val);
      }
    });
  });
}

setupSingleChip("contactMethodChips", "preferredContactMethod");
setupSingleChip("hasPlotChips", "hasPlot", (v) => v === "true");
setupSingleChip("roadAccessChips", "hasRoadAccess", (v) => v === "true");
setupSingleChip("hasDrawingChips", "hasDrawing");
setupMultiChip("structuresChips", "additionalStructures");

function onStateChange() {
  document.getElementById("plotOtherWrap").style.display =
    state.hasPlot === false ? "block" : "none";
  document.getElementById("planFileWrap").style.display =
    state.hasDrawing === "Yes" ? "block" : "none";
}

document.getElementById("projectType").addEventListener("change", (e) => {
  document.getElementById("projectTypeOtherWrap").style.display =
    e.target.value === "Other" ? "block" : "none";
});

// ---------- file drop handlers ----------
function setupFileDrop(dropId, inputId, stateKey) {
  const drop = document.getElementById(dropId);
  const input = document.getElementById(inputId);
  drop.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    if (input.files && input.files[0]) {
      state[stateKey] = input.files[0];
      drop.textContent = "✓ " + input.files[0].name;
      drop.classList.add("filled");
    }
  });
}
setupFileDrop("nrcFrontDrop", "nrcFrontFile", "nrcFrontFile");
setupFileDrop("nrcBackDrop", "nrcBackFile", "nrcBackFile");
setupFileDrop("planDrop", "planFile", "planFile");

// ---------- step navigation ----------
const nextBtn = document.getElementById("nextBtn");
const backBtn = document.getElementById("backBtn");
const stepLabel = document.getElementById("stepLabel");
const stepNames = ["APPLICANT", "PROJECT & SITE", "SPECIFICATIONS", "BUDGET & PAYMENT", "REVIEW"];

function showStep(step) {
  document.querySelectorAll(".form-step").forEach((el) => {
    el.classList.toggle("hidden", Number(el.dataset.step) !== step);
  });
  document.querySelectorAll(".step-dot").forEach((dot) => {
    dot.classList.toggle("active", Number(dot.dataset.dot) <= step);
  });
  stepLabel.textContent = `STEP ${step + 1} OF 5 — ${stepNames[step]}`;
  backBtn.style.display = step === 0 ? "none" : "inline-flex";
  nextBtn.textContent = step === totalSteps - 1 ? "Submit Application" : "Continue";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3200);
}

function validateStep(step) {
  if (step === 0) {
    if (!val("applicantName") || !val("phoneNumber") || !val("nrcNumber") || !val("email")) {
      showToast("Please fill in all required applicant fields");
      return false;
    }
    if (!state.nrcFrontFile || !state.nrcBackFile) {
      showToast("Please upload both NRC front and back photos");
      return false;
    }
  }
  if (step === 1) {
    if (!val("location") || state.hasPlot === null) {
      showToast("Please complete the project and site details");
      return false;
    }
  }
  if (step === 2) {
    if (!val("specifications")) {
      showToast("Please describe your specifications");
      return false;
    }
  }
  if (step === 3) {
    if (!val("initialPaymentDate") || !val("preferredStartDate")) {
      showToast("Please select both dates");
      return false;
    }
  }
  return true;
}

function val(id) {
  return document.getElementById(id).value.trim();
}

function buildReview() {
  const rows = [
    ["Name", val("applicantName")],
    ["Phone", val("phoneNumber")],
    ["Location", val("location")],
    ["Project Type", document.getElementById("projectType").value],
    ["Budget", document.getElementById("budgetRange").value],
    ["Payment", `${document.getElementById("paymentMethod").value} • ${document.getElementById("paymentSubscription").value}`],
    ["Start Date", val("preferredStartDate")],
  ];
  document.getElementById("reviewSummary").innerHTML = rows
    .map(([k, v]) => `<div>${k.toUpperCase().padEnd(14, "\u00A0")} ${v || "-"}</div>`)
    .join("");
}

nextBtn.addEventListener("click", async () => {
  if (!validateStep(currentStep)) return;

  if (currentStep < totalSteps - 1) {
    currentStep++;
    if (currentStep === totalSteps - 1) buildReview();
    showStep(currentStep);
  } else {
    await submitApplication();
  }
});

backBtn.addEventListener("click", () => {
  if (currentStep > 0) {
    currentStep--;
    showStep(currentStep);
  }
});

// ---------- submission ----------
async function submitApplication() {
  nextBtn.disabled = true;
  nextBtn.textContent = "Uploading photos...";

  try {
    const nrcFrontUrl = await uploadToCloudinary(state.nrcFrontFile, "nrc_front");
    const nrcBackUrl = await uploadToCloudinary(state.nrcBackFile, "nrc_back");
    let planFileUrl = null;
    if (state.planFile) {
      planFileUrl = await uploadToCloudinary(state.planFile, "plans");
    }

    nextBtn.textContent = "Saving application...";

    const application = {
      applicantName: val("applicantName"),
      phoneNumber: val("phoneNumber"),
      nrcNumber: val("nrcNumber"),
      nrcFrontUrl,
      nrcBackUrl,
      location: val("location"),
      hasPlot: state.hasPlot,
      plotOtherDetails: val("plotOtherDetails") || null,
      email: val("email"),
      projectType: document.getElementById("projectType").value,
      projectTypeOther: document.getElementById("projectType").value === "Other" ? val("projectTypeOther") : null,
      specifications: val("specifications"),
      hasDrawing: state.hasDrawing,
      planFileUrl,
      paymentMethod: document.getElementById("paymentMethod").value,
      paymentSubscription: document.getElementById("paymentSubscription").value,
      initialPaymentDate: new Date(val("initialPaymentDate")).toISOString(),
      buildingModifications: val("buildingModifications") || null,
      houseType: document.getElementById("houseType").value || null,
      specialNeeds: val("specialNeeds") || null,
      budgetRange: document.getElementById("budgetRange").value,
      preferredStartDate: new Date(val("preferredStartDate")).toISOString(),
      plotSize: val("plotSize") || null,
      numberOfFloors: parseInt(document.getElementById("numberOfFloors").value) || 1,
      additionalStructures: state.additionalStructures,
      hasRoadAccess: state.hasRoadAccess,
      preferredContactMethod: state.preferredContactMethod,
      alternateContactName: null,
      alternateContactPhone: null,
      referralSource: null,
      status: "submitted",
      notice: null,
      submittedAt: new Date().toISOString(),
    };

    await addDoc(collection(db, "applications"), application);

    document.getElementById("formShell").innerHTML = `
      <div style="padding:60px 30px; text-align:center;">
        <div style="font-size:40px; margin-bottom:10px;">✓</div>
        <h2 style="margin-bottom:10px;">Application Submitted!</h2>
        <p style="color:var(--ink-soft); max-width:400px; margin:0 auto 26px;">
          We've received your application. Save your phone number or NRC number — you'll need it to track progress.
        </p>
        <a href="track.html" class="btn btn-primary">Track My Application</a>
      </div>
    `;
  } catch (err) {
    showToast("Error: " + err.message);
    nextBtn.disabled = false;
    nextBtn.textContent = "Submit Application";
  }
}

showStep(0);
