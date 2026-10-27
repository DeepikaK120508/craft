import { auth } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

// Other files already call toast(message, type).
export function toast(message, type = "success") {
  document.querySelectorAll(".toast").forEach(function (notice) {
    notice.remove();
  });

  const notice = document.createElement("div");
  notice.className = "toast";
  notice.textContent = String(message);
  notice.setAttribute("role", type === "error" ? "alert" : "status");
  notice.setAttribute("aria-atomic", "true");
  notice.style.background = type === "error"
    ? "var(--danger, #c0392b)"
    : "var(--primary-dark, #234638)";
  notice.style.color = "white";
  document.body.appendChild(notice);

  window.setTimeout(function () {
    notice.remove();
  }, 5000);
}

const header = document.getElementById("site-header");

if (header) {
  header.innerHTML = `
    <nav class="navbar" aria-label="Main navigation">
      <a class="logo" href="index.html">CRAFT</a>
      <button
        class="menu-toggle nav-toggle"
        id="menu-toggle"
        type="button"
        aria-label="Open navigation"
        aria-controls="nav-links"
        aria-expanded="false"
      >☰</button>
      <div class="nav-links" id="nav-links">
        <a href="index.html">Home</a>
        <a href="requests.html">Requests</a>
        <a href="post-request.html">Post a Request</a>
        <a href="my-requests.html">My Requests</a>
        <a href="sharing.html">My Sharing</a>
        <a href="notifications.html">Notifications</a>
        <a href="register.html" id="create-account-link">Create Account</a>
        <a href="login.html" id="login-link">Login</a>
        <button id="logout-button" type="button" hidden>Logout</button>
      </div>
    </nav>
  `;

  const toggle = document.getElementById("menu-toggle");
  const navLinks = document.getElementById("nav-links");
  const logout = document.getElementById("logout-button");

  function setMenuOpen(open) {
    // Support both existing CSS files until their naming is unified.
    navLinks.classList.toggle("show", open);
    navLinks.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  }

  toggle.addEventListener("click", function () {
    setMenuOpen(toggle.getAttribute("aria-expanded") !== "true");
  });

  header.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setMenuOpen(false);
      toggle.focus();
    }
  });

  onAuthStateChanged(auth, function (user) {
    document.getElementById("create-account-link").hidden = !!user;
    document.getElementById("login-link").hidden = !!user;
    logout.hidden = !user;
  }, function (error) {
    console.error("Could not check login state:", error);
    toast("Could not check your login. Please reload the page.", "error");
  });

  logout.addEventListener("click", async function () {
    logout.disabled = true;
    try {
      await signOut(auth);
      window.location.href = "index.html";
    } catch (error) {
      console.error("Logout failed:", error);
      toast("Could not log out. Please try again.", "error");
      logout.disabled = false;
    }
  });
}

const footer = document.getElementById("site-footer");
if (footer) {
  footer.innerHTML = "<p>&copy; 2026 CRAFT - Campus Resource Sharing Platform</p>";
}
