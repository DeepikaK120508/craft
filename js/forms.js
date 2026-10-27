import { toast } from "./app.js";
import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection, addDoc, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  validateLogin, validateRegister, validateRequest, showErrors
} from "./validation.js";

let loginReady = false;
let student = null;
onAuthStateChanged(auth, function (user) {
  student = user;
  loginReady = true;
}, function (error) {
  console.error("Could not check login:", error);
  student = null;
  loginReady = false;
});

function trimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validate(form, data) {
  let errors = {};
  if (form.id === "login-form") errors = validateLogin(data);
  if (form.id === "register-form") {
    errors = validateRegister(data);
    if (form.elements.namedItem("confirm") && data.password !== data.confirm) {
      errors.confirm = "The passwords do not match.";
    }
  }
  if (form.id === "login-form" || form.id === "register-form") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed(data.email))) {
      errors.email = "Please enter a valid email address.";
    }
  }
  if (form.id === "request-form") {
    errors = validateRequest(data);
    const item = trimmed(data.title || data.item || data.itemName);
    if (!item || item.length > 80) errors.item = "Enter an item name of 1 to 80 characters.";
    if (!trimmed(data.description) || data.description.length > 500) {
      errors.description = "Enter a description of 1 to 500 characters.";
    }
    if (form.elements.namedItem("category") && !trimmed(data.category)) {
      errors.category = "Please choose a category.";
    }
    if (!["lend", "free"].includes(data.requestType)) {
      errors.requestType = "Please choose Loan or Give Free.";
    }
    if (!trimmed(data.location) || data.location.length > 120) {
      errors.location = "Enter a campus collection location of 1 to 120 characters.";
    }
    const start = Date.parse(data.neededAt || "");
    const end = Date.parse(data.returnAt || "");
    if (!Number.isFinite(start)) errors.neededAt = "Please enter when the item is needed.";
    if (!Number.isFinite(end)) errors.returnAt = "Please enter the needed-until / return time.";
    if (Number.isFinite(start) && Number.isFinite(end) && end <= start) {
      errors.returnAt = "The needed-until / return time must be after the needed-on time.";
    }
    if (Number.isFinite(end) && end <= Date.now()) {
      errors.returnAt = "Please choose an end time in the future.";
    }
  }
  return errors;
}

const knownForms = ["login-form", "register-form", "request-form"];
document.querySelectorAll("form[id]").forEach(function (form) {
  if (!knownForms.includes(form.id)) return;
  let submitting = false;
  const button = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (submitting) return;
    if (form.id === "request-form" && !form.elements.namedItem("location")) {
      toast("Please install the updated post-request.html first.", "error");
      return;
    }
    const data = Object.fromEntries(new FormData(form).entries());
    if (!showErrors(form, validate(form, data))) return;
    if (form.id === "request-form") {
      if (!loginReady) {
        toast("Still checking your login. Wait a moment and try again.", "error");
        return;
      }
      if (!student || !auth.currentUser || student.uid !== auth.currentUser.uid) {
        toast("Please log in before posting a request.", "error");
        return;
      }
    }
    submitting = true;
    const originalLabel = button ? button.textContent : "";
    if (button) { button.disabled = true; button.textContent = "Please wait..."; }
    try {
      if (form.id === "register-form") {
        const credential = await createUserWithEmailAndPassword(auth, trimmed(data.email), data.password);
        try {
          await updateProfile(credential.user, { displayName: trimmed(data.name || data.fullName) });
        } catch (error) {
          console.error("Account created, but name could not be saved:", error);
          toast("Account created, but the name could not be saved. You can still log in.", "error");
          form.reset();
          return;
        }
        window.location.href = "index.html";
        return;
      }
      if (form.id === "login-form") {
        await signInWithEmailAndPassword(auth, trimmed(data.email), data.password);
        window.location.href = "index.html";
        return;
      }
      const user = auth.currentUser;
      if (!user || !student || user.uid !== student.uid) {
        toast("Your login changed. Please log in again.", "error");
        return;
      }
      const requestData = {
        userId: user.uid,
        userName: user.displayName || user.email || "Student",
        item: trimmed(data.title || data.item || data.itemName),
        description: trimmed(data.description),
        category: trimmed(data.category),
        requestType: data.requestType,
        location: trimmed(data.location),
        neededAt: Timestamp.fromDate(new Date(data.neededAt)),
        returnAt: Timestamp.fromDate(new Date(data.returnAt)),
        isEmergency: form.elements.namedItem("isEmergency").checked,
        status: "open",
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, "requests"), requestData);
      form.reset();
      toast("Request posted. Open Requests or My Requests to check it.", "success");
    } catch (error) {
      console.error("CRAFT form error:", error);
      const messages = {
        "auth/email-already-in-use": "This email is already registered. Please log in.",
        "auth/invalid-email": "Please enter a valid email address.",
        "auth/weak-password": "Use a password with at least 6 characters.",
        "auth/invalid-credential": "Incorrect email or password.",
        "auth/too-many-requests": "Too many attempts. Please wait before trying again.",
        "auth/network-request-failed": "Check your internet connection and try again.",
        "permission-denied": "Saving was not allowed. Check your login and published Firestore rules.",
        "unavailable": "Could not connect. Check your internet connection and try again."
      };
      toast(messages[error.code] || "Could not finish. Please check your connection and try again.", "error");
    } finally {
      submitting = false;
      if (button) { button.disabled = false; button.textContent = originalLabel; }
    }
  });

  if (form.id === "request-form") {
    const requiredFields = ["title", "description", "category", "requestType", "location", "neededAt", "returnAt", "isEmergency"];
    const ready = requiredFields.every(function (name) { return !!form.elements.namedItem(name); });
    const notice = form.previousElementSibling;
    if (!ready) {
      if (button) button.disabled = true;
      toast("Please install the updated post-request.html so all required fields are present.", "error");
      return;
    }
    // Handler and required fields are ready. Enable the transitional button.
    if (button) { button.disabled = false; button.textContent = "Post request"; }
    if (notice && notice.classList.contains("notice") && notice.textContent.includes("Form update in progress")) {
      notice.textContent = "Use a campus meeting point and enter times in your device's local time. Submit only requests you intend to save.";
    }
  }
});
