  export function validateLogin(data) {
const errors = {};

if (!data.email || !data.email.trim()) {
errors.email = "Please enter your email.";
}

if (!data.password) {
errors.password = "Please enter your password.";
}

return errors;
}

export function validateRegister(data) {
const errors = {};

const name = data.name || data.fullName || "";

if (!name.trim()) {
errors.name = "Please enter your name.";
}

if (!data.email || !data.email.trim()) {
errors.email = "Please enter your email.";
} else if (!/^[^\s@]+@[^\s@]+.[^\s@]+$/.test(data.email)) {
errors.email = "Please enter a valid email address.";
}

if (!data.password) {
errors.password = "Please enter a password.";
} else if (data.password.length < 6) {
errors.password = "Password must contain at least 6 characters.";
}

return errors;
}

export function validateRequest(data) {
const errors = {};

const item = data.item || data.itemName || data.title || "";

if (!item.trim()) {
errors.item = "Please enter the item name.";
}

if (!data.description || !data.description.trim()) {
errors.description = "Please enter a description.";
}

if (!data.requestType) {
errors.requestType = "Please select a request type.";
}

return errors;
}

export function showErrors(form, errors) {
const oldError = form.querySelector(".validation-summary");

if (oldError) {
oldError.remove();
}

if (!errors || Object.keys(errors).length === 0) {
return true;
}

const summary = document.createElement("div");
summary.className = "validation-summary";
summary.setAttribute("role", "alert");

const list = document.createElement("ul");

Object.values(errors).forEach(message => {
const item = document.createElement("li");
item.textContent = message;
list.appendChild(item);
});

summary.appendChild(list);
form.prepend(summary);

return false;
}

