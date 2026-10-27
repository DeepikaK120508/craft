import { auth, db } from "./firebase.js";
import { toast } from "./app.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection, query, where, onSnapshot, doc, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const requestList = document.getElementById("request-list");
let currentUser = null;
let stopListening = null;
let viewVersion = 0;

function showMessage(title, detail) {
  const box = document.createElement("div");
  box.className = "empty";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = detail;
  box.append(heading, paragraph);
  requestList.replaceChildren(box);
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function milliseconds(value) {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value && typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value === "string" && value.trim()) {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : 0;
  }
  return 0;
}

function displayDate(value) {
  const time = milliseconds(value);
  if (!time) return "";
  return new Date(time).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
  });
}

function isEmergency(request) {
  return request.isEmergency === true || request.isEmergency === "on";
}

function addDetail(card, label, value) {
  if (!value) return;
  const paragraph = document.createElement("p");
  paragraph.textContent = label + ": " + value;
  card.appendChild(paragraph);
}

function acceptanceError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

async function acceptRequest(id, button) {
  const helper = currentUser;
  const version = viewVersion;
  if (!helper) {
    toast("Please log in before accepting a request.", "error");
    return;
  }
  button.disabled = true;
  button.textContent = "Accepting...";
  try {
    const ref = doc(db, "requests", id);
    await runTransaction(db, async function (transaction) {
      // The callback may be retried. Keep UI changes outside it.
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw acceptanceError("craft/not-found");
      const request = snapshot.data();
      if (request.userId === helper.uid) throw acceptanceError("craft/own-request");
      if (request.status !== "open") throw acceptanceError("craft/already-accepted");
      if (version !== viewVersion || !currentUser || currentUser.uid !== helper.uid) {
        throw acceptanceError("craft/auth-changed");
      }
      if (!text(request.userId) || !text(request.item)) {
        throw acceptanceError("craft/incomplete-request");
      }
      const helperName = helper.displayName || helper.email || "Student";
      transaction.update(ref, {
        status: "accepted",
        helperId: helper.uid,
        helperName,
        acceptedAt: serverTimestamp()
      });
      // This write must succeed together with acceptance, never separately.
      transaction.set(doc(db, "notifications", id), {
        userId: request.userId,
        requestId: id,
        item: request.item,
        helperId: helper.uid,
        helperName,
        message: "Your request for " + request.item + " has been accepted by " + helperName + ".",
        createdAt: serverTimestamp(),
        read: false
      });
    });
    if (version === viewVersion) {
      toast("Request accepted and notification saved for the requester.", "success");
      button.textContent = "Accepted";
    }
    // onSnapshot removes the accepted request from this open-only list.
    // The notification is private under the matching Firestore rules.
  } catch (error) {
    console.error("Could not accept request:", error);
    if (version !== viewVersion) return;
    const messages = {
      "craft/incomplete-request": "This older request is missing its item or owner details and cannot be accepted safely.",
      "craft/not-found": "This request no longer exists.",
      "craft/own-request": "You cannot accept your own request.",
      "craft/already-accepted": "This request has already been accepted or is no longer open.",
      "craft/auth-changed": "Your login changed. Please reload and try again.",
      "permission-denied": "Acceptance was not allowed. Check that the new notification rules were published. The request may also have changed.",
      "unauthenticated": "Please log in again before accepting.",
      "unavailable": "Could not connect. Check your internet connection and try again.",
      "aborted": "Another update happened at the same time. Please try again.",
      "failed-precondition": "The request could not be accepted. Check your connection and try again."
    };
    toast(messages[error.code] || "Could not accept this request. Please check your connection and try again.", "error");
    button.disabled = false;
    button.textContent = "Accept";
  }
}

function renderRequests(requests) {
  requestList.replaceChildren();
  if (requests.length === 0) {
    showMessage("No open requests", "New requests will appear here automatically while you are signed in.");
    return;
  }
  requests.sort(function (a, b) {
    return Number(isEmergency(b)) - Number(isEmergency(a))
      || milliseconds(b.createdAt) - milliseconds(a.createdAt)
      || a.id.localeCompare(b.id);
  });
  requests.forEach(function (request) {
    const card = document.createElement("article");
    card.className = "request-card";
    if (isEmergency(request)) {
      const badge = document.createElement("span");
      badge.className = "emergency-badge";
      badge.textContent = "Emergency";
      card.appendChild(badge);
    }
    const heading = document.createElement("h3");
    heading.textContent = text(request.item, "Item request");
    const description = document.createElement("p");
    description.textContent = text(request.description, "No description provided.");
    card.append(heading, description);
    addDetail(card, "Posted by", text(request.userName, "Student"));
    addDetail(card, "Collection location", text(request.location));
    addDetail(card, "Needed on", displayDate(request.neededAt || request.neededBy));
    addDetail(card, "Needed until / return by", displayDate(request.returnAt || request.returnDate));
    if (request.requestType === "lend") addDetail(card, "Type", "Loan");
    if (request.requestType === "free") addDetail(card, "Type", "Give Free");
    if (request.userId === currentUser.uid) {
      addDetail(card, "Your request", "Another student can accept it.");
    } else {
      const button = document.createElement("button");
      button.className = "btn";
      button.type = "button";
      button.textContent = "Accept";
      button.addEventListener("click", function () {
        acceptRequest(request.id, button);
      });
      card.appendChild(button);
    }
    requestList.appendChild(card);
  });
}

if (requestList) {
  onAuthStateChanged(auth, function (user) {
    viewVersion += 1;
    const version = viewVersion;
    if (stopListening) {
      stopListening();
      stopListening = null;
    }
    currentUser = user;
    if (!user) {
      showMessage("Please log in", "Only signed-in students can view and accept campus requests.");
      return;
    }
    showMessage("Loading requests...", "Looking for open requests from students.");
    const openQuery = query(collection(db, "requests"), where("status", "==", "open"));
    stopListening = onSnapshot(openQuery, function (snapshot) {
      if (version !== viewVersion) return;
      const requests = snapshot.docs.map(function (item) {
        // The document ID must win over any stored field called id.
        return { ...item.data(), id: item.id };
      });
      renderRequests(requests);
    }, function (error) {
      if (version !== viewVersion) return;
      console.error("Could not load requests:", error);
      showMessage("Could not load requests", error.code === "permission-denied"
        ? "Please check your login and published Firestore read rules."
        : "Please check your internet connection, then reload the page.");
    });
  }, function (error) {
    viewVersion += 1;
    currentUser = null;
    if (stopListening) stopListening();
    stopListening = null;
    console.error("Could not check login:", error);
    showMessage("Could not check your login", "Please reload the page and sign in again.");
  });
}
