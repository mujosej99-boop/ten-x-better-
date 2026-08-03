const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
}
const db = admin.firestore();

// Set these in Vercel's dashboard under Project -> Settings -> Environment
// Variables (not in this file, and never commit real secrets to GitHub):
//   SMS_WEBHOOK_SECRET   -> any long random string you pick
//   FIREBASE_PROJECT_ID  -> from your service account JSON
//   FIREBASE_CLIENT_EMAIL -> from your service account JSON
//   FIREBASE_PRIVATE_KEY -> from your service account JSON (keep the \n's as-is)
const WEBHOOK_SECRET = process.env.SMS_WEBHOOK_SECRET;

// ============================================================
// PHONE NORMALIZATION
// Airtel SMS shows the sender's number without the leading 0
// (e.g. "779935760"), while the website/app collects it as
// "0779935760". Normalize both down to a bare 9-digit form so they
// compare equal.
// ============================================================
function normalizePhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("260")) return digits.slice(3);
  if (digits.length === 10 && digits.startsWith("0")) return digits.slice(1);
  if (digits.length === 9) return digits;
  return digits;
}

// ============================================================
// SMS PARSING — tuned to these real examples:
//
// Airtel:
//   "You have received ZMW 73.00 from 779935760 MAKNEMBO LENA.
//    Dial *115# to check your new Bal. TID: PP260716.0924.F74300."
//
// MTN (no transaction ID in the message at all):
//   "Y'ello. You have received ZMW 21.00 ZMW from MASOLE VINCENT
//    at 2026-06-20 19:37:39. Dial *115# to view balance.
//    Thank you for using Momo from MTN."
// ============================================================
function parseSms(text, provider) {
  if (!text) return null;

  const amountMatch = text.match(/(?:ZMW|K)\s?([\d,]+(?:\.\d{1,2})?)/i);
  if (!amountMatch) return null;
  const amount = parseFloat(amountMatch[1].replace(/,/g, ""));

  let transactionId = null;
  const tidMatch =
    text.match(/TID:\s*([A-Za-z0-9.]+)/i) ||
    text.match(/Transaction\s*ID[:\s]*([A-Za-z0-9.]+)/i);
  if (tidMatch) {
    transactionId = tidMatch[1].replace(/\.$/, "");
  }

  const phoneMatch = text.match(/\bfrom\s+(0?\d{9})\b/i);
  const senderPhone = phoneMatch ? normalizePhone(phoneMatch[1]) : null;

  let senderName = null;
  if (senderPhone) {
    const nameAfterPhone = text.match(/\bfrom\s+0?\d{9}\s+([A-Za-z][A-Za-z'.\- ]{1,40}?)[.\s]*(?:Dial|$)/i);
    if (nameAfterPhone) senderName = nameAfterPhone[1].trim();
  } else {
    const nameOnly = text.match(/\bfrom\s+([A-Za-z][A-Za-z'.\- ]{1,40}?)\s+at\s+\d{4}-\d{2}-\d{2}/i);
    if (nameOnly) senderName = nameOnly[1].trim();
  }

  if (!transactionId) {
    const timeMatch = text.match(/at\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
    const timeKey = timeMatch ? timeMatch[1] : Date.now().toString();
    const nameKey = (senderName || "unknown").toUpperCase().replace(/\s+/g, "_");
    transactionId = `${provider}-${amount}-${nameKey}-${timeKey}`.replace(/[^A-Za-z0-9._-]/g, "");
  }

  return {
    amount,
    senderPhone,
    senderName: senderName ? senderName.toUpperCase().trim() : null,
    transactionId,
  };
}

async function logManualReview(smsText, parsed, provider, reason) {
  return db.collection("manualReview").add({
    smsText,
    parsed,
    provider,
    reason,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  // 1. Verify the request actually came from your SMS forwarder.
  const providedSecret = req.headers["x-webhook-secret"] || req.query.secret;
  if (!WEBHOOK_SECRET || providedSecret !== WEBHOOK_SECRET) {
    res.status(401).send("Unauthorized");
    return;
  }

  const provider = req.query.provider === "MTN" ? "MTN" : "Airtel";

  const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body || {};
  const smsText = body.text || body.message || body.sms || "";
  const parsed = parseSms(smsText, provider);

  if (!parsed) {
    res.status(200).send("Not recognised as a payment SMS, ignored");
    return;
  }

  const { amount, senderPhone, senderName, transactionId } = parsed;

  // 2. Prevent double-processing the same transaction.
  const dedupRef = db.collection("completedPayments").doc(transactionId);
  const dedupSnap = await dedupRef.get();
  if (dedupSnap.exists) {
    res.status(200).send("Duplicate transaction ignored");
    return;
  }

  // 3. Find the matching pending payment.
  let query = db
    .collection("pendingPayments")
    .where("status", "==", "Pending")
    .where("amount", "==", amount)
    .where("provider", "==", provider);

  if (provider === "Airtel") {
    if (!senderPhone) {
      await logManualReview(smsText, parsed, provider, "airtel_sms_missing_phone");
      res.status(200).send("Airtel SMS had no phone number, flagged for manual review");
      return;
    }
    query = query.where("phone", "==", senderPhone);
  } else {
    if (!senderName) {
      await logManualReview(smsText, parsed, provider, "mtn_sms_missing_name");
      res.status(200).send("MTN SMS had no name, flagged for manual review");
      return;
    }
    query = query.where("accountName", "==", senderName);
  }

  const matches = await query.get();

  if (matches.size !== 1) {
    await logManualReview(
      smsText,
      parsed,
      provider,
      matches.size === 0 ? "no_match" : "ambiguous_multiple_matches"
    );
    res
      .status(200)
      .send(matches.size === 0 ? "No matching pending payment" : "Multiple possible matches, flagged for manual review");
    return;
  }

  // 4. Confirm it.
  const paymentDoc = matches.docs[0];
  const paymentData = paymentDoc.data();

  await paymentDoc.ref.update({
    status: "Paid",
    transactionId,
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await dedupRef.set({
    transactionId,
    matchedPaymentId: paymentDoc.id,
    houseId: paymentData.houseId,
    uid: paymentData.uid || null,
    phone: senderPhone || null,
    accountName: senderName || null,
    amount,
    provider,
    paidAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  res.status(200).send("Payment matched and confirmed");
};

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return {};
  }
}
