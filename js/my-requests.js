import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const requestList = document.getElementById("my-requests-list");
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

function renderRequests(requests) {
  if (!requests.length) {
    showMessage("No requests yet", "Your posted requests will appear here.");
    return;
  }
  requestList.replaceChildren();
  requests.sort(function (a, b) {
    return milliseconds(b.createdAt) - milliseconds(a.createdAt) || a.id.localeCompare(b.id);
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
    const status = document.createElement("p");
    status.className = "status";
    status.textContent = "Status: " + (request.status === "accepted" ? "Accepted"
      : request.status === "open" ? "Open" : "Not recorded / unknown");
    card.appendChild(status);
    if (request.status === "accepted") {
      addDetail(card, "Helper", text(request.helperName, "Helper name not recorded"));
      addDetail(card, "Accepted on", displayDate(request.acceptedAt));
    }
    addDetail(card, "Collection location", text(request.location));
    addDetail(card, "Needed on", displayDate(request.neededAt || request.neededBy));
    addDetail(card, "Needed until / return by", displayDate(request.returnAt || request.returnDate));
    addDetail(card, "Posted on", displayDate(request.createdAt));
    if (request.requestType === "lend") addDetail(card, "Type", "Loan");
    if (request.requestType === "free") addDetail(card, "Type", "Give Free");
    requestList.appendChild(card);
  });
}

if (requestList) {
  onAuthStateChanged(auth, function (user) {
    viewVersion += 1;
    const version = viewVersion;
    if (stopListening) { stopListening(); stopListening = null; }
    if (!user) {
      showMessage("Please log in", "Sign in to see the requests you posted.");
      return;
    }
    showMessage("Loading your requests...", "Checking requests posted by your account.");
    const ownQuery = query(collection(db, "requests"), where("userId", "==", user.uid));
    stopListening = onSnapshot(ownQuery, function (snapshot) {
      if (version !== viewVersion) return;
      // Keep a defensive UID check in addition to the server-side query.
      const requests = snapshot.docs.map(function (item) {
        return { ...item.data(), id: item.id };
      }).filter(function (request) { return request.userId === user.uid; });
      renderRequests(requests);
    }, function (error) {
      if (version !== viewVersion) return;
      console.error("Could not load your requests:", error);
      showMessage("Could not load your requests", error.code === "permission-denied"
        ? "Check your login and published Firestore read rules."
        : "Check your internet connection, then reload the page.");
    });
  }, function (error) {
    viewVersion += 1;
    if (stopListening) stopListening();
    stopListening = null;
    console.error("Could not check login:", error);
    showMessage("Could not check your login", "Reload the page and sign in again.");
  });
}
