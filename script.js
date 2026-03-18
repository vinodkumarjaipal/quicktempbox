let account = null;
let token = null;
let inboxInterval = null;

async function generateAccount() {
    try {
        const username = Math.random().toString(36).substring(2, 10);

        // Get domains
        const domainRes = await fetch("https://api.mail.tm/domains");
        if (!domainRes.ok) {
            showAlert("Failed to fetch email domains. Please try again.");
            return;
        }

        const domainData = await domainRes.json();
        if (
            !domainData["hydra:member"] ||
            domainData["hydra:member"].length === 0
        ) {
            showAlert("No email domains available. Please try again later.");
            return;
        }

        const domain = domainData["hydra:member"][0].domain;
        const address = `${username}@${domain}`;
        const password = Math.random().toString(36).substring(2, 12);

        // Create account
        const res = await fetch("https://api.mail.tm/accounts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address, password }),
        });

        if (!res.ok) {
            showAlert("Failed to create temp email. Please try again.");
            return;
        }

        account = { address, password };
        document.getElementById("emailDisplay").innerText = address;
        localStorage.setItem("tm_account", JSON.stringify(account));

        // Login
        const loginRes = await fetch("https://api.mail.tm/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address, password }),
        });

        if (!loginRes.ok) {
            showAlert("Account created but failed to login. Please try again.");
            return;
        }

        const loginData = await loginRes.json();
        token = loginData.token;
        localStorage.setItem("tm_token", token);

        // Start polling inbox
        if (inboxInterval) clearInterval(inboxInterval);
        checkInbox();
        inboxInterval = setInterval(checkInbox, 15000);

        showAlert("Email account created successfully!");
    } catch (error) {
        showAlert("An error occurred. Please try again.");
        console.error(error);
    }
}

function showAlert(message) {
    const alert = document.getElementById("alert");
    const alertMessage = document.getElementById("alertMessage");
    alertMessage.textContent = message;
    alert.classList.add("show");

    // Auto hide after 3 seconds
    setTimeout(() => {
        closeAlert();
    }, 3000);
}

function closeAlert() {
    const alert = document.getElementById("alert");
    alert.classList.remove("show");
}

function copyEmail() {
    const email = document.getElementById("emailDisplay").innerText;
    const copyIcons = document.querySelectorAll(".fa-copy");

    // Animate all copy icons
    copyIcons.forEach((icon) => {
        icon.classList.remove("icon-animate-copy");
        // Force reflow to restart animation
        void icon.offsetWidth;
        icon.classList.add("icon-animate-copy");
    });

    if (!email || email === "---") {
        showAlert("Please generate an email first!");
        return;
    }

    navigator.clipboard
        .writeText(email)
        .then(() => {
            showAlert("Email copied to clipboard!");
        })
        .catch(() => {
            showAlert("Failed to copy email");
        });
}


const emailIcon = document.getElementById("emailRefreshIcon");
const inboxIcon = document.getElementById("inboxRefreshIcon");

function triggerSpin(icon) {
    // Remove class to restart animation
    icon.classList.remove("animate-spin");

    // Force reflow so animation restarts
    void icon.offsetWidth;

    // Add class to start animation
    icon.classList.add("animate-spin");
}

// Add click events
emailIcon.addEventListener("click", () => triggerSpin(emailIcon));
inboxIcon.addEventListener("click", () => triggerSpin(inboxIcon));



function refreshInbox() {
    const icon = document.getElementById("inboxRefreshIcon");
    icon.classList.remove("icon-animate-refresh");
    void icon.offsetWidth;
    icon.classList.add("icon-animate-refresh");

    checkInbox().then(() => {
        setTimeout(() => {
            icon.classList.remove("icon-animate-refresh");
        }, 800);
    });
}
// Add this function to manage read message IDs
function getReadMessages() {
    const stored = localStorage.getItem("tm_read_messages");
    return stored ? JSON.parse(stored) : [];
}

function markMessageAsRead(messageId) {
    const readMessages = getReadMessages();
    if (!readMessages.includes(messageId)) {
        readMessages.push(messageId);
        localStorage.setItem("tm_read_messages", JSON.stringify(readMessages));
    }
}

async function checkInbox() {
    if (!token) return;

    const inbox = document.getElementById("inbox");

    // Show loading message before API call
    inbox.innerHTML = "<p>Loading...</p>";

    try {
        const inboxRes = await fetch("https://api.mail.tm/messages", {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (!inboxRes.ok) {
            inbox.innerHTML = "<p>Failed to load inbox.</p>";
            showAlert("Failed to load inbox");
            return;
        }

        const inboxData = await inboxRes.json();
        const messages = inboxData["hydra:member"];
        const existingMessages = inbox.querySelectorAll(".message");
        if (existingMessages.length === messages.length) {
            return;
        }
        // Clear inbox before populating
        inbox.innerHTML = "";

        if (messages.length === 0) {
            inbox.innerHTML = "<p>No messages yet.</p>";
            return;
        }

        const readMessages = getReadMessages();

        for (let msg of messages) {
            const receivedDate = new Date(msg.createdAt);
            const formattedDate = receivedDate.toLocaleString();

            const messageDiv = document.createElement("div");
            messageDiv.classList.add("message");

            const isRead =
                msg.hasAttachments || msg.seen || readMessages.includes(msg.id);
            messageDiv.classList.add(isRead ? "read" : "unread");
            messageDiv.dataset.messageId = msg.id;

            const header = document.createElement("div");
            header.classList.add("message-header");

            header.innerHTML = `
    <strong>From:</strong> ${msg.from.address}<br>
    <strong>Subject:</strong> ${msg.subject}<br>
    <strong>Time:</strong> ${formattedDate}<br>
    <strong>Preview:</strong> ${msg.intro}
`;

            messageDiv.appendChild(header);

            messageDiv.onclick = () => showMessage(msg.id, messageDiv);
            inbox.appendChild(messageDiv);
        }
    } catch (error) {
        inbox.innerHTML = "<p>Error loading messages.</p>";
        console.error(error);
        showAlert("Error loading inbox");
    }
}

async function showMessage(id, div) {
    // Mark message as read when opened
    div.classList.remove("unread");
    div.classList.add("read");
    markMessageAsRead(id);

    // Check if message body is already shown
    let bodyDiv = div.querySelector(".message-body");

    if (bodyDiv) {
        bodyDiv.remove(); // Toggle off
        return;
    }

    try {
        const res = await fetch(`https://api.mail.tm/messages/${id}`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (!res.ok) {
            throw new Error("Failed to fetch message");
        }

        const data = await res.json();
        const body = data.text || "No message content.";

        const newDiv = document.createElement("div");
        newDiv.classList.add("message-body");

        // Create a container for the email content
        const contentDiv = document.createElement("div");
        contentDiv.classList.add("message-content");
        contentDiv.innerText = body;

        // Create controls for the message
        const controlsDiv = document.createElement("div");
        controlsDiv.classList.add("message-controls");

        // Add a close button
        const closeButton = document.createElement("button");
        closeButton.classList.add("message-close");
        closeButton.innerHTML = '<i class="fas fa-times"></i>';
        closeButton.onclick = (e) => {
            e.stopPropagation(); // Prevent event from bubbling up
            newDiv.remove();
        };

        // Add a copy button
        const copyButton = document.createElement("button");
        copyButton.classList.add("message-copy");
        copyButton.innerHTML = '<i class="fas fa-copy"></i>';
        copyButton.onclick = (e) => {
            e.stopPropagation(); // Prevent event from bubbling up
            navigator.clipboard
                .writeText(body)
                .then(() => showAlert("Message content copied to clipboard!"))
                .catch(() => showAlert("Failed to copy message content"));
        };

        // Add buttons to controls
        controlsDiv.appendChild(copyButton);
        controlsDiv.appendChild(closeButton);

        // Add both content and controls to the message body
        newDiv.appendChild(contentDiv);
        newDiv.appendChild(controlsDiv);

        // Add click stop propagation to prevent collapse when clicking inside
        newDiv.onclick = (e) => {
            e.stopPropagation();
        };

        div.appendChild(newDiv);
    } catch (error) {
        console.error("Error fetching message:", error);
        showAlert("Failed to load message content");
    }
}

async function deleteAccount() {
    if (!token || !account) {
        showAlert("No active email to delete");
        return;
    }

    // Animate delete icon
    const deleteIcon = document.querySelector(".action-button.delete i");
    if (deleteIcon) {
        deleteIcon.classList.remove("icon-animate-delete");
        void deleteIcon.offsetWidth;
        deleteIcon.classList.add("icon-animate-delete");
    }

    // Clear the inbox and account info
    document.getElementById("inbox").innerHTML = "<p>No messages yet.</p>";
    document.getElementById("emailDisplay").innerText = "---";
    account = null;
    token = null;
    localStorage.removeItem("tm_account");
    localStorage.removeItem("tm_token");
    localStorage.removeItem("tm_read_messages"); // Clear read status too

    showAlert("Email address deleted!");

    if (inboxInterval) {
        clearInterval(inboxInterval);
        inboxInterval = null;
    }
}

// Set current year in footer
document.getElementById("currentYear").textContent = new Date().getFullYear();

// Mobile menu toggle
const mobileMenuBtn = document.querySelector(".mobile-menu-btn");
const mainNav = document.querySelector(".main-nav");

mobileMenuBtn.addEventListener("click", function () {
    mainNav.classList.toggle("show");
});

// Close mobile menu when clicking on a nav link
const navLinks = document.querySelectorAll(".main-nav a");
navLinks.forEach((link) => {
    link.addEventListener("click", function () {
        mainNav.classList.remove("show");
    });
});

// Add this at the end of the file
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute("href"));

        if (target) {
            // Close mobile menu if open
            document.querySelector(".main-nav").classList.remove("show");

            // Smooth scroll to target
            target.scrollIntoView({
                behavior: "smooth",
                block: "start",
            });

            // Update active state
            document.querySelectorAll(".main-nav a").forEach((link) => {
                link.classList.remove("active");
            });
            this.classList.add("active");
        }
    });
});

// Update active menu item on scroll
window.addEventListener("scroll", () => {
    const sections = document.querySelectorAll("section, div[id]");
    const navLinks = document.querySelectorAll(".main-nav a");

    let currentSection = "";

    sections.forEach((section) => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;

        if (window.pageYOffset >= sectionTop - 60) {
            currentSection = section.getAttribute("id");
        }
    });

    navLinks.forEach((link) => {
        link.classList.remove("active");
        if (link.getAttribute("href").substring(1) === currentSection) {
            link.classList.add("active");
        }
    });
});

function linkify(text) {
    // Regex to match URLs (http, https)
    return text.replace(
        /(https?:\/\/[^\s\]\)]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
}

// Restore account and token from localStorage on page load
window.addEventListener("DOMContentLoaded", () => {
    const savedAccount = localStorage.getItem("tm_account");
    const savedToken = localStorage.getItem("tm_token");
    if (savedAccount && savedToken) {
        account = JSON.parse(savedAccount);
        token = savedToken;
        document.getElementById("emailDisplay").innerText = account.address;
        checkInbox();
        inboxInterval = setInterval(checkInbox, 15000);
    }
});
