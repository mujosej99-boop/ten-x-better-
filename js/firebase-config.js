// Shared Firebase setup — used by every page.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBN6o1uqF3Wz0qaWZgtgPOCy_13fSobgeo",
  appId: "1:72213262614:web:dc950b4abc65a60e742037",
  messagingSenderId: "72213262614",
  projectId: "ten-times-project-limited",
  authDomain: "ten-times-project-limited.firebaseapp.com",
  storageBucket: "ten-times-project-limited.firebasestorage.app",
  measurementId: "G-9CDYNL34HF",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  onSnapshot,
};

// Cloudinary — same account the Flutter app uploads to.
export const CLOUDINARY_CLOUD_NAME = "fu3tlueo";
export const CLOUDINARY_UPLOAD_PRESET = "flutter_uploads";

export async function uploadToCloudinary(file, folder) {
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", folder);

  const response = await fetch(url, { method: "POST", body: formData });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error("Upload failed: " + errText);
  }
  const data = await response.json();
  return data.secure_url;
}

export const STATUS_LABELS = {
  submitted: "Submitted",
  under_review: "Under Review",
  accepted: "Accepted",
  in_progress: "In Progress",
  completed: "Completed",
};
