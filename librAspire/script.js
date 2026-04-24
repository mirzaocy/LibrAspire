const STORAGE_KEYS = {
    users: "libraspire-local-users",
    currentUser: "libraspire-local-current-user",
    userBooks: "libraspire-user-books",
    activityLog: "libraspire-activity-log",
    contactDraft: "libraspire-contact-draft",
    contactMessages: "libraspire-contact-messages"
};

const API_ENDPOINTS = {
    session: "/api/session",
    login: "/api/login",
    register: "/api/register",
    logout: "/api/logout"
};

const EXTERNAL_BOOKS_API = "https://www.googleapis.com/books/v1/volumes";
const DEFAULT_DISCOVERY_QUERY = "frontend development";
const AUTH_MODE = document.body.dataset.authMode === "local" ? "local" : "backend";

const LIBRARY_BOOKS = [
    {
        id: "atomic-habits",
        title: "Atomic Habits",
        author: "James Clear",
        category: "Self Development",
        status: "available",
        summary: "Belajar membangun sistem kecil yang konsisten untuk menghasilkan perubahan besar.",
        description: "Buku ini membahas bagaimana perubahan kecil yang dilakukan secara konsisten bisa membentuk kebiasaan baru yang lebih sehat, produktif, dan tahan lama.",
        pages: 320,
        published: "2018",
        tags: ["Habit System", "Consistency", "Growth"],
        cover: "assets/atomic-habits.svg"
    },
    {
        id: "how-to-win",
        title: "How to Win Friends and Influence People",
        author: "Dale Carnegie",
        category: "Communication",
        status: "available",
        summary: "Panduan klasik untuk membangun relasi, empati, dan komunikasi yang lebih meyakinkan.",
        description: "Fokus utama buku ini adalah komunikasi antar manusia: bagaimana mendengar dengan lebih baik, memahami sudut pandang orang lain, dan memengaruhi tanpa memaksa.",
        pages: 291,
        published: "1936",
        tags: ["Communication", "Leadership", "Empathy"],
        cover: "assets/how-to-win.svg"
    },
    {
        id: "laws-of-power",
        title: "10 Laws of Power",
        author: "Robert Greene",
        category: "Strategy",
        status: "unavailable",
        summary: "Membaca pola strategi, kekuasaan, dan pengaruh dari berbagai konteks sosial.",
        description: "LibrAspire menempatkan judul ini sebagai bacaan strategi yang sedang tidak tersedia, sehingga bisa dipakai untuk demonstrasi antrean dan perubahan state pada UI.",
        pages: 452,
        published: "1998",
        tags: ["Strategy", "Influence", "Power"],
        cover: "assets/laws-of-power.svg"
    },
    {
        id: "clean-code",
        title: "Clean Code",
        author: "Robert C. Martin",
        category: "Technology",
        status: "available",
        summary: "Rujukan penting untuk menulis kode yang lebih rapi, mudah dibaca, dan mudah dirawat.",
        description: "Buku ini relevan untuk developer yang ingin meningkatkan kualitas kode melalui penamaan yang jelas, pemecahan fungsi yang baik, dan disiplin refactoring.",
        pages: 464,
        published: "2008",
        tags: ["Code Quality", "Refactoring", "Engineering"],
        cover: "assets/clean-code.svg"
    }
];

let currentUser = AUTH_MODE === "local" ? readStorage(STORAGE_KEYS.currentUser, null) : null;
let backendReady = AUTH_MODE === "local" || window.location.protocol !== "file:";

function readStorage(key, fallbackValue) {
    try {
        const rawValue = window.localStorage.getItem(key);
        return rawValue ? JSON.parse(rawValue) : fallbackValue;
    } catch (error) {
        return fallbackValue;
    }
}

function writeStorage(key, value) {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        // Abaikan error penyimpanan agar fitur utama tetap berjalan.
    }
}

function normalizeText(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (character) => {
        const replacements = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return replacements[character] || character;
    });
}

function stripHtmlTags(value) {
    return String(value || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function delay(milliseconds) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, milliseconds);
    });
}

function isEmailValid(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function updateFeedback(element, message, tone) {
    if (!element) {
        return;
    }

    element.textContent = message;
    element.hidden = !message;
    element.classList.remove("is-error", "is-success");

    if (tone === "error") {
        element.classList.add("is-error");
    }

    if (tone === "success") {
        element.classList.add("is-success");
    }
}

function notifyBooksChanged() {
    document.dispatchEvent(new CustomEvent("libraspire:books-changed"));
}

function notifyAuthChanged() {
    document.dispatchEvent(new CustomEvent("libraspire:auth-changed", { detail: { user: currentUser } }));
}

function getAllBorrowRecords() {
    return readStorage(STORAGE_KEYS.userBooks, {});
}

function getActiveUserKey() {
    return currentUser && currentUser.email ? normalizeText(currentUser.email) : "";
}

function getUserBooks() {
    const userKey = getActiveUserKey();
    return userKey ? getAllBorrowRecords()[userKey] || {} : {};
}

function getUserBookState(bookId) {
    return getUserBooks()[normalizeText(bookId)] || "none";
}

function setUserBookState(bookId, nextState) {
    const userKey = getActiveUserKey();

    if (!userKey) {
        return false;
    }

    const allBorrowRecords = getAllBorrowRecords();
    const userBooks = { ...(allBorrowRecords[userKey] || {}) };
    const bookKey = normalizeText(bookId);

    if (nextState === "none") {
        delete userBooks[bookKey];
    } else {
        userBooks[bookKey] = nextState;
    }

    if (Object.keys(userBooks).length) {
        allBorrowRecords[userKey] = userBooks;
    } else {
        delete allBorrowRecords[userKey];
    }

    writeStorage(STORAGE_KEYS.userBooks, allBorrowRecords);
    return true;
}

function getActivityLog() {
    return readStorage(STORAGE_KEYS.activityLog, []);
}

function saveActivityLog(entries) {
    writeStorage(STORAGE_KEYS.activityLog, entries.slice(0, 12));
}

function buildCategoryStats() {
    const categoryMap = new Map();

    LIBRARY_BOOKS.forEach((book) => {
        const existing = categoryMap.get(book.category) || {
            category: book.category,
            total: 0,
            available: 0,
            unavailable: 0
        };

        existing.total += 1;

        if (normalizeText(book.status) === "available") {
            existing.available += 1;
        } else {
            existing.unavailable += 1;
        }

        categoryMap.set(book.category, existing);
    });

    return Array.from(categoryMap.values()).sort((left, right) => left.category.localeCompare(right.category));
}

function getBookById(bookId) {
    return LIBRARY_BOOKS.find((book) => book.id === bookId) || null;
}

function trackBookActivity(action, bookId) {
    const book = getBookById(bookId);

    if (!book || !currentUser) {
        return;
    }

    const entries = getActivityLog();
    entries.unshift({
        id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
        action: action,
        bookId: book.id,
        bookTitle: book.title,
        category: book.category,
        userName: currentUser.name,
        userEmail: currentUser.email,
        timestamp: new Date().toISOString()
    });
    saveActivityLog(entries);
}

function renderSiteStats() {
    const totalBooksValue = document.querySelector("[data-stat-total-books]");
    const totalCategoriesValue = document.querySelector("[data-stat-total-categories]");
    const availableBooksValue = document.querySelector("[data-stat-available-books]");

    if (!totalBooksValue && !totalCategoriesValue && !availableBooksValue) {
        return;
    }

    const categoryStats = buildCategoryStats();
    const availableCount = categoryStats.reduce((sum, category) => sum + category.available, 0);

    if (totalBooksValue) {
        totalBooksValue.textContent = String(LIBRARY_BOOKS.length);
    }

    if (totalCategoriesValue) {
        totalCategoriesValue.textContent = String(categoryStats.length);
    }

    if (availableBooksValue) {
        availableBooksValue.textContent = String(availableCount);
    }
}

function getActivityActionLabel(action) {
    if (action === "borrowed") {
        return "Pinjam Buku";
    }

    if (action === "returned") {
        return "Kembalikan Buku";
    }

    if (action === "queued") {
        return "Masuk Antrean";
    }

    if (action === "left_queue") {
        return "Keluar Antrean";
    }

    return "Aktivitas Buku";
}

function renderActivityFeed() {
    const activityList = document.querySelector("[data-activity-list]");
    const activitySummary = document.querySelector("[data-activity-summary]");

    if (!activityList && !activitySummary) {
        return;
    }

    const formatter = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });
    const allEntries = getActivityLog().filter((entry) => entry && entry.bookTitle && entry.category && entry.timestamp);
    const normalizedUserEmail = currentUser ? normalizeText(currentUser.email) : "";
    const userEntries = normalizedUserEmail
        ? allEntries.filter((entry) => normalizeText(entry.userEmail) === normalizedUserEmail)
        : [];
    const scopedEntries = userEntries.length ? userEntries : allEntries;
    const visibleEntries = scopedEntries.slice(0, 6);

    if (!visibleEntries.length) {
        if (activitySummary) {
            activitySummary.textContent = "Belum ada aktivitas peminjaman tercatat. Coba pinjam atau antrekan buku untuk mulai membangun histori.";
        }

        if (activityList) {
            activityList.innerHTML = '<div class="activity-empty">Riwayat aktivitas akan muncul di sini setelah ada interaksi dengan katalog.</div>';
        }

        return;
    }

    if (activitySummary) {
        if (currentUser && userEntries.length) {
            activitySummary.textContent = "Menampilkan " + visibleEntries.length + " aktivitas terbaru untuk " + currentUser.name + ".";
        } else if (currentUser) {
            activitySummary.textContent = "Belum ada aktivitas atas nama " + currentUser.name + ". Menampilkan histori perpustakaan lokal terbaru dari browser ini.";
        } else {
            activitySummary.textContent = "Login untuk menyimpan histori personal. Sementara ini menampilkan " + visibleEntries.length + " aktivitas terbaru dari browser ini.";
        }
    }

    if (activityList) {
        activityList.innerHTML = visibleEntries.map((entry) => {
            const actorName = entry.userName || entry.userEmail || "Pengguna lokal";
            const activityDate = new Date(entry.timestamp);
            const readableTime = Number.isNaN(activityDate.getTime())
                ? "Waktu tidak diketahui"
                : formatter.format(activityDate);

            return `
                <article class="activity-item">
                    <div class="activity-item__head">
                        <div>
                            <p class="book-meta book-meta--eyebrow">${escapeHtml(getActivityActionLabel(entry.action))}</p>
                            <h3 class="activity-item__title">${escapeHtml(entry.bookTitle)}</h3>
                        </div>
                        <p class="activity-item__time">${escapeHtml(readableTime)}</p>
                    </div>
                    <p class="book-meta">${escapeHtml(actorName)} - ${escapeHtml(entry.category)}</p>
                </article>
            `;
        }).join("");
    }
}

function renderCategoryOverview() {
    const overviewGrid = document.querySelector("[data-category-overview]");

    if (!overviewGrid) {
        return;
    }

    const categoryStats = buildCategoryStats();

    if (!categoryStats.length) {
        overviewGrid.innerHTML = '<div class="activity-empty">Kategori lokal belum tersedia.</div>';
        return;
    }

    overviewGrid.innerHTML = categoryStats.map((category) => {
        let availabilityNote = "Semua buku di kategori ini sedang tersedia.";

        if (category.available === 0) {
            availabilityNote = "Seluruh buku sedang tidak tersedia. Gunakan antrean untuk tetap ikut membaca.";
        } else if (category.available !== category.total) {
            availabilityNote = category.available + " dari " + category.total + " buku bisa dipinjam sekarang.";
        }

        return `
            <article class="overview-card">
                <div>
                    <p class="book-meta book-meta--eyebrow">Kategori Lokal</p>
                    <h3 class="overview-card__title">${escapeHtml(category.category)}</h3>
                </div>
                <p class="catalog-summary">${escapeHtml(availabilityNote)}</p>
                <div class="overview-card__stats">
                    <span class="overview-stat">Total ${category.total}</span>
                    <span class="overview-stat">Tersedia ${category.available}</span>
                    <span class="overview-stat">Antre ${category.unavailable}</span>
                </div>
                <button class="secondary-button secondary-button--surface" type="button" data-category="${escapeHtml(category.category)}">Buka Kategori</button>
            </article>
        `;
    }).join("");
}

function getBookStatusLabel(status) {
    if (status === "borrowed") {
        return "Borrowed";
    }

    if (status === "unavailable") {
        return "Unavailable";
    }

    if (status === "external") {
        return "External";
    }

    return "Available";
}

function getDisplayStatus(baseAvailability, userState) {
    return userState === "borrowed" ? "borrowed" : baseAvailability;
}

function getActionLabel(baseAvailability, userState) {
    if (userState === "borrowed") {
        return "Kembalikan Buku";
    }

    if (userState === "waiting") {
        return "Keluar dari Antrean";
    }

    return baseAvailability === "available" ? "Pinjam Buku" : "Masuk Antrean";
}

function getStateText(baseAvailability, userState) {
    if (userState === "borrowed") {
        return "Buku ini sedang kamu pinjam.";
    }

    if (userState === "waiting") {
        return "Kamu sudah masuk ke antrean buku ini.";
    }

    if (!currentUser) {
        return baseAvailability === "available"
            ? "Login dulu untuk meminjam buku ini."
            : "Login dulu untuk masuk antrean buku ini.";
    }

    return baseAvailability === "available"
        ? "Buku ini siap dipinjam sekarang."
        : "Buku sedang tidak tersedia, tapi kamu bisa masuk antrean.";
}

function buildBookUrl(bookId) {
    return "book.html?id=" + encodeURIComponent(bookId);
}

function buildRemoteBookUrl(bookId) {
    return "book.html?remote=" + encodeURIComponent(bookId);
}

function createFallbackCover(title) {
    const safeTitle = String(title || "Book");
    const firstLine = safeTitle.slice(0, 18) || "Book";
    const secondLine = safeTitle.length > 18 ? safeTitle.slice(18, 36) : "Reference";
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420" role="img" aria-label="${safeTitle}">
            <defs>
                <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#1f5c7a" />
                    <stop offset="100%" stop-color="#eb7a52" />
                </linearGradient>
            </defs>
            <rect width="300" height="420" rx="28" fill="url(#bg)" />
            <rect x="34" y="38" width="232" height="344" rx="22" fill="rgba(255,255,255,0.18)" />
            <text x="42" y="220" fill="#ffffff" font-family="Georgia, serif" font-size="28" font-weight="700">${firstLine}</text>
            <text x="42" y="256" fill="#fff1e6" font-family="Georgia, serif" font-size="28" font-weight="700">${secondLine}</text>
        </svg>
    `;

    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

function normalizeCoverUrl(url) {
    return url ? String(url).replace(/^http:\/\//i, "https://") : "";
}

function renderLocalBookCard(book, options = {}) {
    const baseAvailability = normalizeText(book.status) || "available";
    const userState = getUserBookState(book.id);
    const displayStatus = getDisplayStatus(baseAvailability, userState);
    const detailHref = buildBookUrl(book.id);
    const showAction = options.showAction !== false;

    return `
        <article class="book-card" data-book-card data-book-source="local" data-book-id="${escapeHtml(book.id)}" data-book-title="${escapeHtml(book.title)}" data-book-author="${escapeHtml(book.author)}" data-book-category="${escapeHtml(book.category)}" data-book-status="${escapeHtml(baseAvailability)}">
            <a class="book-card__media" href="${detailHref}">
                <img class="book-cover" src="${escapeHtml(book.cover)}" alt="Cover buku ${escapeHtml(book.title)}">
            </a>
            <div class="book-card__body">
                <div class="book-card__header">
                    <p class="book-meta book-meta--eyebrow">${escapeHtml(book.category)}</p>
                    <span class="status-chip ${displayStatus}">${getBookStatusLabel(displayStatus)}</span>
                </div>
                <h3 class="book-title"><a class="book-card__title-link" href="${detailHref}">${escapeHtml(book.title)}</a></h3>
                <p class="book-meta">${escapeHtml(book.author)}</p>
                <p class="book-card__summary">${escapeHtml(book.summary)}</p>
                <p class="book-state" data-book-state>${escapeHtml(getStateText(baseAvailability, userState))}</p>
            </div>
            <div class="book-card__actions">
                <a class="text-button" href="${detailHref}">Lihat Detail</a>
                ${showAction ? `<button class="primary-button book-action" type="button" data-book-action>${escapeHtml(getActionLabel(baseAvailability, userState))}</button>` : ""}
            </div>
        </article>
    `;
}

function renderCategoryButtons() {
    const categoryLists = document.querySelectorAll("[data-category-list]");

    if (!categoryLists.length) {
        return;
    }

    const categoryMarkup = buildCategoryStats()
        .map((category) => `<li><button class="category-item" type="button" data-category="${escapeHtml(category.category)}">${escapeHtml(category.category)} (${category.total})</button></li>`)
        .join("");

    categoryLists.forEach((categoryList) => {
        categoryList.innerHTML = categoryMarkup;
    });
}

function renderFeaturedBooks() {
    const featuredGrid = document.querySelector("[data-featured-grid]");

    if (!featuredGrid) {
        return;
    }

    featuredGrid.innerHTML = LIBRARY_BOOKS.slice(0, 3).map((book) => renderLocalBookCard(book)).join("");
}

function renderCatalogBooks() {
    const bookGrid = document.querySelector("[data-book-grid]");

    if (!bookGrid) {
        return;
    }

    bookGrid.innerHTML = LIBRARY_BOOKS.map((book) => renderLocalBookCard(book)).join("");
}

function syncStatusChip(chip, nextStatus) {
    if (!chip) {
        return;
    }

    chip.textContent = getBookStatusLabel(nextStatus);
    chip.classList.remove("available", "unavailable", "borrowed", "external");
    chip.classList.add(nextStatus);
}

function syncBookCards() {
    document.querySelectorAll('[data-book-card][data-book-source="local"]').forEach((card) => {
        const bookId = card.dataset.bookId || "";
        const baseAvailability = normalizeText(card.dataset.bookStatus) || "available";
        const userState = getUserBookState(bookId);
        const displayStatus = getDisplayStatus(baseAvailability, userState);
        const actionButton = card.querySelector("[data-book-action]");
        const stateLabel = card.querySelector("[data-book-state]");
        const statusChip = card.querySelector(".status-chip");

        syncStatusChip(statusChip, displayStatus);

        if (actionButton) {
            actionButton.textContent = getActionLabel(baseAvailability, userState);
            actionButton.classList.toggle("is-borrowed", userState === "borrowed");
            actionButton.classList.toggle("is-waiting", userState === "waiting");
        }

        if (stateLabel) {
            stateLabel.textContent = getStateText(baseAvailability, userState);
        }
    });
}

function redirectToCatalog(searchValue, categoryValue) {
    const nextUrl = new URL("catalog.html", window.location.href);

    if (searchValue) {
        nextUrl.searchParams.set("search", searchValue);
    }

    if (categoryValue) {
        nextUrl.searchParams.set("category", categoryValue);
    }

    window.location.href = nextUrl.pathname + nextUrl.search;
}

function setupHomeSearch() {
    const homeForm = document.querySelector('[data-search-form="redirect"]');

    if (!homeForm) {
        return;
    }

    const input = homeForm.querySelector("[data-search-input]");
    homeForm.addEventListener("submit", (event) => {
        event.preventDefault();
        redirectToCatalog(input ? input.value.trim() : "", "");
    });
}

function setupCategoryNavigation() {
    document.addEventListener("click", (event) => {
        const categoryTrigger = event.target.closest("[data-category]");

        if (!categoryTrigger) {
            return;
        }

        const categoryValue = categoryTrigger.dataset.category || "";

        if (!categoryValue) {
            return;
        }

        event.preventDefault();
        redirectToCatalog("", categoryValue);
    });
}

function setupCatalogPage() {
    const catalogForm = document.querySelector('[data-search-form="catalog"]');

    if (!catalogForm) {
        return;
    }

    const input = catalogForm.querySelector("[data-search-input]");
    const summary = document.querySelector("[data-catalog-summary]");
    const emptyState = document.querySelector("[data-empty-state]");
    const clearButton = document.querySelector("[data-clear-filters]");
    const filterButtons = Array.from(document.querySelectorAll("[data-status-filter]"));
    const params = new URLSearchParams(window.location.search);
    const requestedStatus = params.get("status") || "all";
    const allowedStatuses = ["all", "available", "borrowed", "unavailable"];
    const catalogState = {
        search: params.get("search") || "",
        category: params.get("category") || "",
        status: allowedStatuses.includes(requestedStatus) ? requestedStatus : "all"
    };

    if (input) {
        input.value = catalogState.search;
    }

    function getCards() {
        return Array.from(document.querySelectorAll('[data-book-card][data-book-source="local"]'));
    }

    function getCurrentStatus(card) {
        const baseAvailability = normalizeText(card.dataset.bookStatus) || "available";
        return getDisplayStatus(baseAvailability, getUserBookState(card.dataset.bookId || ""));
    }

    function buildSummary(visibleCount) {
        const parts = [visibleCount + " buku ditemukan"];
        if (catalogState.search) parts.push('pencarian "' + catalogState.search + '"');
        if (catalogState.category) parts.push("kategori " + catalogState.category);
        if (catalogState.status !== "all") parts.push("status " + getBookStatusLabel(catalogState.status).toLowerCase());
        return parts.join(" | ");
    }

    function syncFilterButtons() {
        filterButtons.forEach((button) => {
            button.classList.toggle("is-selected", button.dataset.statusFilter === catalogState.status);
        });
    }

    function syncUrl() {
        const nextParams = new URLSearchParams();
        if (catalogState.search) nextParams.set("search", catalogState.search);
        if (catalogState.category) nextParams.set("category", catalogState.category);
        if (catalogState.status !== "all") nextParams.set("status", catalogState.status);
        const nextUrl = window.location.pathname + (nextParams.toString() ? "?" + nextParams.toString() : "");
        window.history.replaceState({}, "", nextUrl);
    }

    function applyFilters() {
        const normalizedSearch = normalizeText(catalogState.search);
        const normalizedCategory = normalizeText(catalogState.category);
        let visibleCount = 0;

        getCards().forEach((card) => {
            const title = normalizeText(card.dataset.bookTitle);
            const author = normalizeText(card.dataset.bookAuthor);
            const category = normalizeText(card.dataset.bookCategory);
            const searchableText = [title, author, category].join(" ");
            const matchesSearch = !normalizedSearch || searchableText.includes(normalizedSearch);
            const matchesCategory = !normalizedCategory || category === normalizedCategory;
            const matchesStatus = catalogState.status === "all" || getCurrentStatus(card) === catalogState.status;
            const isVisible = matchesSearch && matchesCategory && matchesStatus;

            card.hidden = !isVisible;
            if (isVisible) visibleCount += 1;
        });

        syncFilterButtons();
        if (summary) summary.textContent = buildSummary(visibleCount);
        if (emptyState) emptyState.hidden = visibleCount !== 0;
        if (clearButton) clearButton.hidden = !(catalogState.search || catalogState.category || catalogState.status !== "all");
    }

    catalogForm.addEventListener("submit", (event) => {
        event.preventDefault();
        catalogState.search = input ? input.value.trim() : "";
        syncUrl();
        applyFilters();
    });

    filterButtons.forEach((button) => {
        button.addEventListener("click", () => {
            catalogState.status = button.dataset.statusFilter || "all";
            syncUrl();
            applyFilters();
        });
    });

    if (clearButton) {
        clearButton.addEventListener("click", () => {
            catalogState.search = "";
            catalogState.category = "";
            catalogState.status = "all";
            if (input) input.value = "";
            syncUrl();
            applyFilters();
        });
    }

    document.addEventListener("libraspire:books-changed", applyFilters);
    document.addEventListener("libraspire:auth-changed", applyFilters);
    applyFilters();
}

function getModeDescription() {
    if (AUTH_MODE === "local") {
        return "Mode lokal aktif. Akun demo dan status login disimpan di browser ini.";
    }

    return backendReady
        ? "Mode backend aktif. Akun disimpan lewat server Python dan sesi login memakai cookie."
        : "Mode backend belum aktif. Jalankan python server.py lalu buka http://127.0.0.1:8000/home.html.";
}

function updateModeNotes() {
    document.querySelectorAll("[data-auth-mode-note]").forEach((element) => {
        element.textContent = getModeDescription();
    });
}

function updateAuthUi() {
    document.querySelectorAll("[data-auth-greeting]").forEach((element) => {
        element.textContent = currentUser
            ? "Halo, " + currentUser.name
            : AUTH_MODE === "backend" && !backendReady
                ? "Backend belum aktif"
                : "Belum login";
    });

    document.querySelectorAll("[data-open-login]").forEach((button) => {
        button.hidden = Boolean(currentUser);
    });

    document.querySelectorAll("[data-logout]").forEach((button) => {
        button.hidden = !currentUser;
    });

    updateModeNotes();
}

function getAuthModalElements() {
    return {
        modal: document.querySelector("[data-auth-modal]"),
        feedback: document.querySelector("[data-login-feedback]"),
        form: document.querySelector("[data-login-form]"),
        nameInput: document.getElementById("login-name"),
        emailInput: document.getElementById("login-email"),
        passwordInput: document.getElementById("login-password")
    };
}

function openAuthModal(message, tone) {
    const elements = getAuthModalElements();
    if (!elements.modal) return;
    elements.modal.hidden = false;
    document.body.classList.add("modal-open");
    updateFeedback(elements.feedback, message || "", tone || "");
    const focusTarget = elements.emailInput || elements.nameInput || elements.passwordInput;
    if (focusTarget) {
        window.setTimeout(() => {
            focusTarget.focus();
        }, 0);
    }
}

function closeAuthModal() {
    const elements = getAuthModalElements();
    if (!elements.modal) return;
    elements.modal.hidden = true;
    document.body.classList.remove("modal-open");
    updateFeedback(elements.feedback, "", "");
}

function validateAuthInput(mode, elements) {
    const name = elements.nameInput ? elements.nameInput.value.trim() : "";
    const email = elements.emailInput ? elements.emailInput.value.trim() : "";
    const password = elements.passwordInput ? elements.passwordInput.value : "";

    if (mode === "register" && name.length < 3) {
        return { isValid: false, message: "Nama untuk pendaftaran minimal 3 karakter.", target: elements.nameInput };
    }

    if (!email) {
        return { isValid: false, message: "Email wajib diisi.", target: elements.emailInput };
    }

    if (!isEmailValid(email)) {
        return { isValid: false, message: "Format email belum valid.", target: elements.emailInput };
    }

    if (!password) {
        return { isValid: false, message: "Password wajib diisi.", target: elements.passwordInput };
    }

    if (password.length < 6) {
        return { isValid: false, message: "Password minimal 6 karakter.", target: elements.passwordInput };
    }

    return { isValid: true, payload: { name: name, email: email, password: password } };
}

function getLocalUsers() {
    return readStorage(STORAGE_KEYS.users, []);
}

function saveLocalUsers(users) {
    writeStorage(STORAGE_KEYS.users, users);
}

function saveLocalCurrentUser(user) {
    currentUser = user;
    writeStorage(STORAGE_KEYS.currentUser, user);
}

async function apiRequest(url, options) {
    if (window.location.protocol === "file:") {
        throw new Error("Backend login tidak bisa dipakai dari file HTML langsung. Jalankan python server.py lalu buka http://127.0.0.1:8000/home.html.");
    }

    const requestOptions = {
        method: options && options.method ? options.method : "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" }
    };

    if (options && options.body) {
        requestOptions.headers["Content-Type"] = "application/json";
        requestOptions.body = JSON.stringify(options.body);
    }

    let response;

    try {
        response = await fetch(url, requestOptions);
    } catch (error) {
        throw new Error("Backend belum aktif. Jalankan python server.py lalu buka http://127.0.0.1:8000/home.html.");
    }

    let data = {};

    try {
        data = await response.json();
    } catch (error) {
        data = {};
    }

    if (!response.ok) {
        throw new Error(data.message || "Permintaan ke backend gagal.");
    }

    return data;
}

async function submitAuth(mode) {
    const elements = getAuthModalElements();
    const validation = validateAuthInput(mode, elements);

    if (!validation.isValid) {
        updateFeedback(elements.feedback, validation.message, "error");
        if (validation.target) {
            validation.target.focus();
        }
        return;
    }

    updateFeedback(elements.feedback, mode === "register" ? "Membuat akun..." : "Sedang login...", "success");

    try {
        if (AUTH_MODE === "local") {
            const users = getLocalUsers();
            const payload = validation.payload;
            const normalizedEmail = normalizeText(payload.email);

            if (mode === "register") {
                const existingUser = users.find((user) => normalizeText(user.email) === normalizedEmail);

                if (existingUser) {
                    throw new Error("Email sudah terdaftar. Silakan login.");
                }

                const newUser = { name: payload.name, email: payload.email, password: payload.password };
                users.push(newUser);
                saveLocalUsers(users);
                saveLocalCurrentUser({ name: newUser.name, email: newUser.email });
            } else {
                const matchedUser = users.find((user) => normalizeText(user.email) === normalizedEmail);

                if (!matchedUser) {
                    throw new Error("Akun belum ditemukan. Buat akun dulu ya.");
                }

                if (matchedUser.password !== payload.password) {
                    throw new Error("Password salah.");
                }

                saveLocalCurrentUser({ name: matchedUser.name, email: matchedUser.email });
            }
        } else {
            const response = await apiRequest(mode === "register" ? API_ENDPOINTS.register : API_ENDPOINTS.login, {
                method: "POST",
                body: validation.payload
            });
            backendReady = true;
            currentUser = response.user || null;
        }

        updateAuthUi();
        closeAuthModal();

        if (elements.form) {
            elements.form.reset();
        }

        notifyAuthChanged();
        syncBookCards();
        notifyBooksChanged();
    } catch (error) {
        if (AUTH_MODE === "backend" && String(error.message || "").toLowerCase().includes("backend")) {
            backendReady = false;
            updateAuthUi();
        }

        updateFeedback(elements.feedback, error.message, "error");
    }
}

function setupAuth() {
    const elements = getAuthModalElements();
    const registerButton = document.querySelector("[data-register-submit]");

    document.querySelectorAll("[data-open-login]").forEach((button) => {
        button.addEventListener("click", () => {
            if (AUTH_MODE === "backend" && !backendReady) {
                openAuthModal(getModeDescription(), "error");
                return;
            }

            openAuthModal("", "");
        });
    });

    document.querySelectorAll("[data-close-login]").forEach((button) => {
        button.addEventListener("click", closeAuthModal);
    });

    if (elements.modal) {
        elements.modal.addEventListener("click", (event) => {
            if (event.target === elements.modal) {
                closeAuthModal();
            }
        });
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && elements.modal && !elements.modal.hidden) {
            closeAuthModal();
        }
    });

    if (elements.form) {
        elements.form.addEventListener("submit", async (event) => {
            event.preventDefault();
            await submitAuth("login");
        });
    }

    if (registerButton) {
        registerButton.addEventListener("click", async () => {
            await submitAuth("register");
        });
    }

    document.querySelectorAll("[data-logout]").forEach((button) => {
        button.addEventListener("click", async () => {
            if (AUTH_MODE === "local") {
                saveLocalCurrentUser(null);
            } else {
                try {
                    await apiRequest(API_ENDPOINTS.logout, { method: "POST" });
                    backendReady = true;
                } catch (error) {
                    if (String(error.message || "").toLowerCase().includes("backend")) {
                        backendReady = false;
                    }
                }

                currentUser = null;
            }

            updateAuthUi();
            notifyAuthChanged();
            syncBookCards();
            notifyBooksChanged();
        });
    });

    if (AUTH_MODE === "backend") {
        (async () => {
            try {
                const response = await apiRequest(API_ENDPOINTS.session);
                backendReady = true;
                currentUser = response.user || null;
            } catch (error) {
                backendReady = false;
                currentUser = null;
            }

            updateAuthUi();
            notifyAuthChanged();
            syncBookCards();
            notifyBooksChanged();
        })();
    } else {
        updateAuthUi();
        notifyAuthChanged();
        syncBookCards();
        notifyBooksChanged();
    }
}

function setupBookActions() {
    document.addEventListener("click", (event) => {
        const actionButton = event.target.closest("[data-book-action]");

        if (!actionButton) {
            return;
        }

        const card = actionButton.closest('[data-book-card][data-book-source="local"]');

        if (!card) {
            return;
        }

        if (!currentUser) {
            openAuthModal(
                AUTH_MODE === "backend" && !backendReady
                    ? getModeDescription()
                    : "Silakan login dulu sebelum meminjam buku.",
                "error"
            );
            return;
        }

        const bookId = card.dataset.bookId || "";
        const availability = normalizeText(card.dataset.bookStatus) || "available";
        const currentState = getUserBookState(bookId);
        const nextState = availability === "available"
            ? currentState === "borrowed" ? "none" : "borrowed"
            : currentState === "waiting" ? "none" : "waiting";
        const activityAction = availability === "available"
            ? currentState === "borrowed" ? "returned" : "borrowed"
            : currentState === "waiting" ? "left_queue" : "queued";

        if (setUserBookState(bookId, nextState)) {
            trackBookActivity(activityAction, bookId);
            syncBookCards();
            notifyBooksChanged();
        }
    });
}

function setupContactForm() {
    const contactForm = document.querySelector("[data-contact-form]");

    if (!contactForm) {
        return;
    }

    const nameInput = document.getElementById("name");
    const emailInput = document.getElementById("email");
    const messageInput = document.getElementById("msg");
    const draftStatus = document.querySelector("[data-draft-status]");
    const feedback = document.querySelector("[data-form-feedback]");
    const submissionNote = document.querySelector("[data-submission-note]");

    function getSavedDraft() {
        return readStorage(STORAGE_KEYS.contactDraft, { name: "", email: "", message: "" });
    }

    function fillFromDraftOrAuth() {
        const savedDraft = getSavedDraft();
        if (nameInput) nameInput.value = savedDraft.name || (currentUser ? currentUser.name : "");
        if (emailInput) emailInput.value = savedDraft.email || (currentUser ? currentUser.email : "");
        if (messageInput) messageInput.value = savedDraft.message || "";
    }

    function hasMeaningfulDraft() {
        const currentName = nameInput ? nameInput.value.trim() : "";
        const currentEmail = emailInput ? emailInput.value.trim() : "";
        const currentMessage = messageInput ? messageInput.value.trim() : "";
        const authName = currentUser ? currentUser.name : "";
        const authEmail = currentUser ? currentUser.email : "";

        return Boolean(currentMessage || (currentName && currentName !== authName) || (currentEmail && currentEmail !== authEmail));
    }

    function updateDraftStatus() {
        if (!draftStatus) return;
        const hasDraft = hasMeaningfulDraft();
        draftStatus.hidden = !hasDraft;
        draftStatus.textContent = hasDraft ? "Draft pesan tersimpan otomatis di browser ini." : "";
    }

    function renderSubmissionNote() {
        const savedMessages = readStorage(STORAGE_KEYS.contactMessages, []);

        if (!submissionNote) {
            return;
        }

        if (!savedMessages.length) {
            submissionNote.hidden = true;
            submissionNote.textContent = "";
            return;
        }

        const latestMessage = savedMessages[0];
        const formatter = new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeStyle: "short" });
        const sentDate = formatter.format(new Date(latestMessage.sentAt));
        submissionNote.hidden = false;
        submissionNote.textContent = "Pesan terakhir dari " + latestMessage.name + " (" + latestMessage.email + ") tercatat pada " + sentDate + ". Total " + savedMessages.length + " pesan tersimpan di browser ini.";
    }

    function saveDraft() {
        writeStorage(STORAGE_KEYS.contactDraft, {
            name: nameInput ? nameInput.value : "",
            email: emailInput ? emailInput.value : "",
            message: messageInput ? messageInput.value : ""
        });
        updateDraftStatus();
    }

    fillFromDraftOrAuth();

    if (nameInput) nameInput.addEventListener("input", saveDraft);
    if (emailInput) emailInput.addEventListener("input", saveDraft);
    if (messageInput) messageInput.addEventListener("input", saveDraft);

    document.addEventListener("libraspire:auth-changed", () => {
        if (currentUser) {
            if (nameInput && !nameInput.value.trim()) nameInput.value = currentUser.name;
            if (emailInput && !emailInput.value.trim()) emailInput.value = currentUser.email;
        }

        saveDraft();
    });

    contactForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const name = nameInput ? nameInput.value.trim() : "";
        const email = emailInput ? emailInput.value.trim() : "";
        const message = messageInput ? messageInput.value.trim() : "";

        if (!name) return updateFeedback(feedback, "Nama wajib diisi.", "error");
        if (name.length < 3) return updateFeedback(feedback, "Nama minimal terdiri dari 3 karakter.", "error");
        if (!email) return updateFeedback(feedback, "Email wajib diisi.", "error");
        if (!isEmailValid(email)) return updateFeedback(feedback, "Format email belum valid.", "error");
        if (!message) return updateFeedback(feedback, "Pesan wajib diisi.", "error");
        if (message.length < 10) return updateFeedback(feedback, "Pesan minimal terdiri dari 10 karakter.", "error");

        const savedMessages = readStorage(STORAGE_KEYS.contactMessages, []);
        savedMessages.unshift({ name: name, email: email, message: message, sentAt: new Date().toISOString() });
        writeStorage(STORAGE_KEYS.contactMessages, savedMessages.slice(0, 5));
        contactForm.reset();

        if (currentUser) {
            if (nameInput) nameInput.value = currentUser.name;
            if (emailInput) emailInput.value = currentUser.email;
        }

        if (messageInput) messageInput.value = "";

        writeStorage(STORAGE_KEYS.contactDraft, {
            name: nameInput ? nameInput.value : "",
            email: emailInput ? emailInput.value : "",
            message: ""
        });

        updateDraftStatus();
        updateFeedback(feedback, "Pesan berhasil dikirim. Terima kasih sudah menghubungi LibrAspire.", "success");
        renderSubmissionNote();
    });

    updateDraftStatus();
    renderSubmissionNote();
}

function mapExternalBook(item) {
    const volumeInfo = item && item.volumeInfo ? item.volumeInfo : {};
    const rawDescription = stripHtmlTags(volumeInfo.description || "");
    const categories = Array.isArray(volumeInfo.categories) && volumeInfo.categories.length ? volumeInfo.categories : ["External Reference"];
    const image = normalizeCoverUrl(volumeInfo.imageLinks && (volumeInfo.imageLinks.thumbnail || volumeInfo.imageLinks.smallThumbnail)) || createFallbackCover(volumeInfo.title);

    return {
        id: item.id,
        title: volumeInfo.title || "Untitled Book",
        author: Array.isArray(volumeInfo.authors) && volumeInfo.authors.length ? volumeInfo.authors.join(", ") : "Penulis belum tersedia",
        category: categories[0],
        description: rawDescription || "Belum ada deskripsi dari API eksternal.",
        summary: rawDescription ? rawDescription.slice(0, 140) + (rawDescription.length > 140 ? "..." : "") : "Belum ada ringkasan dari API eksternal.",
        cover: image,
        pages: volumeInfo.pageCount || null,
        published: volumeInfo.publishedDate || "Tidak diketahui",
        tags: categories.slice(0, 3),
        previewLink: volumeInfo.previewLink || volumeInfo.infoLink || "",
        sourceLabel: "API Reference"
    };
}

async function fetchExternalBooks(query) {
    const url = new URL(EXTERNAL_BOOKS_API);
    url.searchParams.set("q", query);
    url.searchParams.set("maxResults", "6");
    url.searchParams.set("printType", "books");

    const response = await fetch(url.toString());

    if (!response.ok) {
        throw new Error("Gagal mengambil data buku eksternal.");
    }

    const data = await response.json();
    return Array.isArray(data.items) ? data.items.map(mapExternalBook) : [];
}

async function fetchExternalBookById(bookId) {
    const response = await fetch(EXTERNAL_BOOKS_API + "/" + encodeURIComponent(bookId));

    if (!response.ok) {
        throw new Error("Detail buku eksternal tidak ditemukan.");
    }

    return mapExternalBook(await response.json());
}

function renderExternalBookCard(book) {
    const detailHref = buildRemoteBookUrl(book.id);

    return `
        <article class="book-card">
            <a class="book-card__media" href="${detailHref}">
                <img class="book-cover" src="${escapeHtml(book.cover)}" alt="Cover buku ${escapeHtml(book.title)}">
            </a>
            <div class="book-card__body">
                <div class="book-card__header">
                    <p class="book-meta book-meta--eyebrow">${escapeHtml(book.sourceLabel)}</p>
                    <span class="status-chip external">External</span>
                </div>
                <h3 class="book-title"><a class="book-card__title-link" href="${detailHref}">${escapeHtml(book.title)}</a></h3>
                <p class="book-meta">${escapeHtml(book.author)}</p>
                <p class="book-card__summary">${escapeHtml(book.summary)}</p>
                <p class="book-state">${escapeHtml(book.category)}</p>
            </div>
            <div class="book-card__actions">
                <a class="text-button" href="${detailHref}">Lihat Detail</a>
            </div>
        </article>
    `;
}

function renderDiscoverySkeletons(count) {
    return Array.from({ length: count }, () => '<div class="skeleton-card" aria-hidden="true"></div>').join("");
}

function setupDiscoverySection() {
    const form = document.querySelector("[data-discovery-form]");

    if (!form) {
        return;
    }

    const input = form.querySelector("[data-discovery-input]");
    const summary = document.querySelector("[data-discovery-summary]");
    const feedback = document.querySelector("[data-discovery-feedback]");
    const grid = document.querySelector("[data-discovery-grid]");
    const emptyState = document.querySelector("[data-discovery-empty]");
    const resetButton = document.querySelector("[data-discovery-reset]");

    async function runSearch(query) {
        const finalQuery = query.trim();

        if (!finalQuery) {
            updateFeedback(feedback, "Masukkan topik pencarian terlebih dahulu.", "error");
            return;
        }

        if (grid) {
            grid.innerHTML = renderDiscoverySkeletons(3);
        }

        if (summary) {
            summary.hidden = true;
        }

        if (emptyState) {
            emptyState.hidden = true;
        }

        if (resetButton) {
            resetButton.hidden = normalizeText(finalQuery) === normalizeText(DEFAULT_DISCOVERY_QUERY);
        }

        updateFeedback(feedback, "Mengambil referensi buku eksternal...", "success");

        try {
            const books = await fetchExternalBooks(finalQuery);
            updateFeedback(feedback, "", "");

            if (summary) {
                summary.hidden = false;
                summary.textContent = books.length + ' referensi ditemukan untuk "' + finalQuery + '".';
            }

            if (grid) {
                grid.innerHTML = books.map(renderExternalBookCard).join("");
            }

            if (emptyState) {
                emptyState.hidden = books.length !== 0;
            }
        } catch (error) {
            if (grid) {
                grid.innerHTML = "";
            }

            if (summary) {
                summary.hidden = true;
            }

            updateFeedback(feedback, error.message, "error");
        }
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        runSearch(input ? input.value : "");
    });

    if (resetButton) {
        resetButton.addEventListener("click", () => {
            if (input) {
                input.value = DEFAULT_DISCOVERY_QUERY;
            }

            runSearch(DEFAULT_DISCOVERY_QUERY);
        });
    }

    runSearch(DEFAULT_DISCOVERY_QUERY);
}

function buildRelatedBooks(selectedBook) {
    const sameCategory = LIBRARY_BOOKS.filter((book) => book.id !== selectedBook.id && normalizeText(book.category) === normalizeText(selectedBook.category));
    const fallbackBooks = LIBRARY_BOOKS.filter((book) => book.id !== selectedBook.id && !sameCategory.includes(book));
    return sameCategory.concat(fallbackBooks).slice(0, 3);
}

function renderDetailView(detail) {
    const isLocal = detail.type === "local";
    const book = detail.book;
    const displayStatus = isLocal ? getDisplayStatus(normalizeText(book.status), getUserBookState(book.id)) : "external";
    const metaItems = [];

    if (book.pages) {
        metaItems.push(`<span class="detail-meta">${escapeHtml(String(book.pages))} halaman</span>`);
    }

    if (book.published) {
        metaItems.push(`<span class="detail-meta">Terbit ${escapeHtml(String(book.published))}</span>`);
    }

    metaItems.push(`<span class="detail-meta">${isLocal ? "Sumber katalog lokal" : "Sumber API eksternal"}</span>`);

    const tags = (book.tags || []).slice(0, 4).map((tag) => `<span class="detail-tag">${escapeHtml(tag)}</span>`).join("");
    const localDataAttributes = isLocal
        ? `data-book-card data-book-source="local" data-book-id="${escapeHtml(book.id)}" data-book-title="${escapeHtml(book.title)}" data-book-author="${escapeHtml(book.author)}" data-book-category="${escapeHtml(book.category)}" data-book-status="${escapeHtml(book.status)}"`
        : "";
    const actions = isLocal
        ? `
            <button class="primary-button book-action" type="button" data-book-action>${escapeHtml(getActionLabel(normalizeText(book.status), getUserBookState(book.id)))}</button>
            <a class="text-button detail-link" href="catalog.html">Kembali ke katalog</a>
        `
        : `
            ${book.previewLink ? `<a class="primary-button button-link" href="${escapeHtml(book.previewLink)}" target="_blank" rel="noreferrer">Buka Preview</a>` : ""}
            <a class="text-button detail-link" href="catalog.html">Kembali ke katalog</a>
        `;

    return `
        <div class="detail-layout" ${localDataAttributes}>
            <div class="detail-cover-shell">
                <img class="detail-cover" src="${escapeHtml(book.cover)}" alt="Cover buku ${escapeHtml(book.title)}">
            </div>
            <div class="detail-copy">
                <p class="section-kicker">${isLocal ? "Local Collection" : "API Reference"}</p>
                <div class="detail-heading-row">
                    <h2 class="section-title">${escapeHtml(book.title)}</h2>
                    <span class="status-chip ${displayStatus}">${getBookStatusLabel(displayStatus)}</span>
                </div>
                <p class="detail-byline">${escapeHtml(book.author)} - ${escapeHtml(book.category)}</p>
                <p class="section-text">${escapeHtml(book.description)}</p>
                <div class="detail-meta-list">${metaItems.join("")}</div>
                <div class="detail-tag-list">${tags}</div>
                <p class="book-state" data-book-state>${isLocal ? escapeHtml(getStateText(normalizeText(book.status), getUserBookState(book.id))) : "Buku eksternal ini bersifat referensi dan tidak masuk ke alur peminjaman lokal."}</p>
                <div class="detail-actions">${actions}</div>
                <p class="detail-note">${isLocal ? "Halaman ini membaca parameter URL lalu menyinkronkan status pinjam ke tampilan detail." : "Detail ini diambil secara async dari API buku eksternal untuk meniru alur loading dan data fetching modern."}</p>
            </div>
        </div>
    `;
}

async function getDetailData() {
    const params = new URLSearchParams(window.location.search);
    const remoteId = params.get("remote");
    const localId = params.get("id") || LIBRARY_BOOKS[0].id;

    if (remoteId) {
        return { type: "external", book: await fetchExternalBookById(remoteId) };
    }

    await delay(450);
    const book = LIBRARY_BOOKS.find((item) => item.id === localId);

    if (!book) {
        throw new Error("Buku lokal tidak ditemukan. Coba buka lagi dari halaman katalog.");
    }

    return { type: "local", book: book };
}

function setupDetailPage() {
    const detailView = document.querySelector("[data-book-detail-view]");

    if (!detailView) {
        return;
    }

    const loading = document.querySelector("[data-detail-loading]");
    const error = document.querySelector("[data-detail-error]");
    const relatedSection = document.querySelector("[data-related-section]");
    const relatedGrid = document.querySelector("[data-related-grid]");

    async function loadDetail() {
        if (loading) loading.hidden = false;
        detailView.hidden = true;
        updateFeedback(error, "", "");

        try {
            const detail = await getDetailData();
            detailView.innerHTML = renderDetailView(detail);
            detailView.hidden = false;
            if (loading) loading.hidden = true;

            if (relatedSection && relatedGrid) {
                const relatedBooks = detail.type === "local" ? buildRelatedBooks(detail.book) : LIBRARY_BOOKS.slice(0, 3);
                relatedGrid.innerHTML = relatedBooks.map((book) => renderLocalBookCard(book)).join("");
                relatedSection.hidden = false;
            }

            syncBookCards();
        } catch (detailError) {
            if (loading) loading.hidden = true;
            detailView.hidden = true;
            updateFeedback(error, detailError.message, "error");
            if (relatedSection) relatedSection.hidden = true;
        }
    }

    loadDetail();
    document.addEventListener("libraspire:books-changed", syncBookCards);
    document.addEventListener("libraspire:auth-changed", syncBookCards);
}

function init() {
    renderSiteStats();
    renderCategoryButtons();
    renderCategoryOverview();
    renderFeaturedBooks();
    renderCatalogBooks();
    renderActivityFeed();
    setupHomeSearch();
    setupCategoryNavigation();
    setupCatalogPage();
    setupDiscoverySection();
    setupContactForm();
    setupBookActions();
    setupDetailPage();
    syncBookCards();
    document.addEventListener("libraspire:books-changed", renderSiteStats);
    document.addEventListener("libraspire:books-changed", renderCategoryOverview);
    document.addEventListener("libraspire:books-changed", renderActivityFeed);
    document.addEventListener("libraspire:auth-changed", renderActivityFeed);
    updateAuthUi();
    setupAuth();
}

init();
