const STORAGE_KEYS = {
    users: "libraspire-local-users",
    currentUser: "libraspire-local-current-user",
    userBooks: "libraspire-user-books",
    userBookMeta: "libraspire-user-book-meta",
    activityLog: "libraspire-activity-log",
    reviews: "libraspire-book-reviews",
    contactDraft: "libraspire-contact-draft",
    contactMessages: "libraspire-contact-messages"
};

const API_ENDPOINTS = {
    session: "/api/session",
    login: "/api/login",
    register: "/api/register",
    logout: "/api/logout",
    libraryState: "/api/library-state"
};

const EXTERNAL_BOOKS_API = "https://www.googleapis.com/books/v1/volumes";
const DEFAULT_DISCOVERY_QUERY = "pengembangan diri";
const AUTH_MODE = document.body.dataset.authMode === "local" ? "local" : "server";
const API_BASE = String(document.body.dataset.apiBase || window.LIBRASPIRE_API_BASE || "").replace(/\/$/, "");
const API_PATHS = {
    session: API_BASE + API_ENDPOINTS.session,
    login: API_BASE + API_ENDPOINTS.login,
    register: API_BASE + API_ENDPOINTS.register,
    logout: API_BASE + API_ENDPOINTS.logout,
    libraryState: API_BASE + API_ENDPOINTS.libraryState
};

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
        description: "Judul strategi ini sedang tidak tersedia untuk dipinjam, tetapi kamu tetap bisa masuk ke antrean agar mendapat giliran berikutnya.",
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
        summary: "Buku teknologi populer untuk pembaca yang ingin memahami cara bekerja lebih rapi dan terstruktur di dunia digital.",
        description: "Bacaan ini cocok untuk anggota yang tertarik pada dunia teknologi dan ingin mempelajari cara berpikir yang lebih rapi, jelas, dan terstruktur.",
        pages: 464,
        published: "2008",
        tags: ["Code Quality", "Refactoring", "Engineering"],
        cover: "assets/clean-code.svg"
    }
];

let currentUser = AUTH_MODE === "local" ? readStorage(STORAGE_KEYS.currentUser, null) : null;
let authServiceReady = AUTH_MODE === "local" || window.location.protocol !== "file:";
const MY_LIBRARY_FILTERS = ["all", "borrowed", "waiting", "reviewed"];
const myLibraryState = { filter: "all" };
const serverState = {
    userBooks: {},
    userBookMeta: {},
    reviews: {}
};

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

function notifyReviewsChanged(bookId) {
    document.dispatchEvent(new CustomEvent("libraspire:reviews-changed", { detail: { bookId: bookId || "" } }));
}

function resetServerLibraryState() {
    serverState.userBooks = {};
    serverState.userBookMeta = {};
    serverState.reviews = {};
}

function applyServerLibraryState(payload) {
    serverState.userBooks = payload && payload.userBooks && typeof payload.userBooks === "object" ? payload.userBooks : {};
    serverState.userBookMeta = payload && payload.userBookMeta && typeof payload.userBookMeta === "object" ? payload.userBookMeta : {};
    serverState.reviews = payload && payload.reviews && typeof payload.reviews === "object" ? payload.reviews : {};
}

function getAllBorrowRecords() {
    if (AUTH_MODE === "server") {
        const userKey = getActiveUserKey();
        return userKey ? { [userKey]: { ...serverState.userBooks } } : {};
    }

    return readStorage(STORAGE_KEYS.userBooks, {});
}

function getAllBorrowMeta() {
    if (AUTH_MODE === "server") {
        const userKey = getActiveUserKey();
        return userKey ? { [userKey]: { ...serverState.userBookMeta } } : {};
    }

    return readStorage(STORAGE_KEYS.userBookMeta, {});
}

function getActiveUserKey() {
    return currentUser && currentUser.email ? normalizeText(currentUser.email) : "";
}

function getUserBooks() {
    if (AUTH_MODE === "server") {
        return serverState.userBooks || {};
    }

    const userKey = getActiveUserKey();
    return userKey ? getAllBorrowRecords()[userKey] || {} : {};
}

function getUserBorrowMeta() {
    if (AUTH_MODE === "server") {
        return serverState.userBookMeta || {};
    }

    const userKey = getActiveUserKey();
    return userKey ? getAllBorrowMeta()[userKey] || {} : {};
}

function getUserBookState(bookId) {
    return getUserBooks()[normalizeText(bookId)] || "none";
}

function addDays(dateValue, days) {
    const nextDate = new Date(dateValue);

    if (Number.isNaN(nextDate.getTime())) {
        return null;
    }

    nextDate.setDate(nextDate.getDate() + days);
    return nextDate;
}

function getBorrowMeta(bookId) {
    return getUserBorrowMeta()[normalizeText(bookId)] || null;
}

function buildBookStateApiPath(bookId) {
    return API_BASE + "/api/my-books/" + encodeURIComponent(bookId) + "/state";
}

function buildBookReviewsApiPath(bookId) {
    return API_BASE + "/api/books/" + encodeURIComponent(bookId) + "/reviews";
}

async function refreshServerLibraryState() {
    if (AUTH_MODE !== "server") {
        return;
    }

    const payload = await apiRequest(API_PATHS.libraryState);
    applyServerLibraryState(payload);
}

async function syncServerStateAndUi() {
    await refreshServerLibraryState();
    syncBookCards();
    notifyBooksChanged();
    notifyReviewsChanged("");
}

async function updateServerUserBookState(bookId, nextState) {
    const payload = await apiRequest(buildBookStateApiPath(bookId), {
        method: "POST",
        body: { state: nextState }
    });

    applyServerLibraryState(payload);
    return true;
}

function setUserBookState(bookId, nextState) {
    const userKey = getActiveUserKey();

    if (!userKey) {
        return false;
    }

    const allBorrowRecords = getAllBorrowRecords();
    const allBorrowMeta = getAllBorrowMeta();
    const userBooks = { ...(allBorrowRecords[userKey] || {}) };
    const userBorrowMeta = { ...(allBorrowMeta[userKey] || {}) };
    const bookKey = normalizeText(bookId);
    const currentMeta = userBorrowMeta[bookKey] || {};
    const timestamp = new Date().toISOString();

    if (nextState === "none") {
        delete userBooks[bookKey];
        delete userBorrowMeta[bookKey];
    } else {
        userBooks[bookKey] = nextState;

        if (nextState === "borrowed") {
            const dueDate = addDays(timestamp, 7);
            userBorrowMeta[bookKey] = {
                status: "borrowed",
                updatedAt: timestamp,
                borrowedAt: timestamp,
                queuedAt: currentMeta.queuedAt || null,
                dueAt: dueDate ? dueDate.toISOString() : null
            };
        }

        if (nextState === "waiting") {
            userBorrowMeta[bookKey] = {
                status: "waiting",
                updatedAt: timestamp,
                queuedAt: currentMeta.queuedAt || timestamp,
                borrowedAt: currentMeta.borrowedAt || null,
                dueAt: currentMeta.dueAt || null
            };
        }
    }

    if (Object.keys(userBooks).length) {
        allBorrowRecords[userKey] = userBooks;
    } else {
        delete allBorrowRecords[userKey];
    }

    if (Object.keys(userBorrowMeta).length) {
        allBorrowMeta[userKey] = userBorrowMeta;
    } else {
        delete allBorrowMeta[userKey];
    }

    writeStorage(STORAGE_KEYS.userBooks, allBorrowRecords);
    writeStorage(STORAGE_KEYS.userBookMeta, allBorrowMeta);
    return true;
}

function getAllReviews() {
    if (AUTH_MODE === "server") {
        return serverState.reviews || {};
    }

    return readStorage(STORAGE_KEYS.reviews, {});
}

function saveAllReviews(reviews) {
    writeStorage(STORAGE_KEYS.reviews, reviews);
}

function getBookReviews(bookId) {
    const bookKey = normalizeText(bookId);
    const reviews = getAllReviews()[bookKey];

    if (!Array.isArray(reviews)) {
        return [];
    }

    return reviews
        .filter((review) => review && review.userEmail && review.rating)
        .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0));
}

function getUserReview(bookId) {
    const userKey = getActiveUserKey();

    if (!userKey) {
        return null;
    }

    return getBookReviews(bookId).find((review) => normalizeText(review.userEmail) === userKey) || null;
}

function getBookRatingSummary(bookId) {
    const reviews = getBookReviews(bookId);

    if (!reviews.length) {
        return { count: 0, average: 0 };
    }

    const totalRating = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
    const averageRating = Math.round((totalRating / reviews.length) * 10) / 10;

    return {
        count: reviews.length,
        average: averageRating
    };
}

function formatRatingValue(value) {
    const roundedValue = Math.round(Number(value || 0) * 10) / 10;
    return Number.isInteger(roundedValue) ? String(roundedValue) : roundedValue.toFixed(1);
}

function getBookRatingSummaryText(bookId) {
    const summary = getBookRatingSummary(bookId);

    if (!summary.count) {
        return "Belum ada ulasan anggota.";
    }

    return formatRatingValue(summary.average) + "/5 dari " + summary.count + " ulasan anggota";
}

function renderStars(value) {
    const safeValue = Math.max(0, Math.min(5, Math.round(Number(value || 0))));
    let stars = "";

    for (let index = 0; index < 5; index += 1) {
        stars += index < safeValue ? "&#9733;" : "&#9734;";
    }

    return stars;
}

function upsertBookReview(bookId, payload) {
    const userKey = getActiveUserKey();

    if (!userKey || !currentUser) {
        return { ok: false, message: "Masuk dulu sebelum memberi rating dan ulasan." };
    }

    const rating = Number(payload && payload.rating);
    const reviewText = String(payload && payload.review ? payload.review : "").trim();

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return { ok: false, message: "Pilih rating antara 1 sampai 5." };
    }

    if (reviewText.length < 10) {
        return { ok: false, message: "Ulasan minimal 10 karakter." };
    }

    const allReviews = getAllReviews();
    const bookKey = normalizeText(bookId);
    const bookReviews = Array.isArray(allReviews[bookKey]) ? [...allReviews[bookKey]] : [];
    const existingIndex = bookReviews.findIndex((review) => normalizeText(review.userEmail) === userKey);
    const timestamp = new Date().toISOString();
    const nextReview = {
        id: existingIndex >= 0 ? bookReviews[existingIndex].id : bookKey + "-" + Date.now().toString(36),
        userName: currentUser.name,
        userEmail: currentUser.email,
        rating: rating,
        review: reviewText,
        createdAt: existingIndex >= 0 ? bookReviews[existingIndex].createdAt || timestamp : timestamp,
        updatedAt: timestamp
    };

    if (existingIndex >= 0) {
        bookReviews.splice(existingIndex, 1);
    }

    bookReviews.unshift(nextReview);
    allReviews[bookKey] = bookReviews;
    saveAllReviews(allReviews);

    return { ok: true, review: nextReview };
}

async function submitServerBookReview(bookId, payload) {
    await apiRequest(buildBookReviewsApiPath(bookId), {
        method: "POST",
        body: payload
    });

    await refreshServerLibraryState();
    return { ok: true };
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

function formatDateLabel(value, options = { dateStyle: "medium" }) {
    if (!value) {
        return "Waktu tidak diketahui";
    }

    const parsedDate = new Date(value);

    if (Number.isNaN(parsedDate.getTime())) {
        return "Waktu tidak diketahui";
    }

    return new Intl.DateTimeFormat("id-ID", options).format(parsedDate);
}

function formatReviewText(value) {
    return escapeHtml(String(value || "")).replace(/\n/g, "<br>");
}

function getDaysUntil(dateValue) {
    const targetDate = new Date(dateValue);

    if (Number.isNaN(targetDate.getTime())) {
        return null;
    }

    const now = new Date();
    const dayInMilliseconds = 24 * 60 * 60 * 1000;
    return Math.ceil((targetDate.getTime() - now.getTime()) / dayInMilliseconds);
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
            activitySummary.textContent = "Belum ada aktivitas atas nama " + currentUser.name + ". Untuk sementara, riwayat terbaru di perangkat ini yang ditampilkan.";
        } else {
            activitySummary.textContent = "Masuk untuk menyimpan riwayat pribadi. Sementara ini menampilkan " + visibleEntries.length + " aktivitas terbaru di perangkat ini.";
        }
    }

    if (activityList) {
        activityList.innerHTML = visibleEntries.map((entry) => {
            const actorName = entry.userName || entry.userEmail || "Pengunjung";
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
        overviewGrid.innerHTML = '<div class="activity-empty">Kategori buku belum tersedia.</div>';
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
                    <p class="book-meta book-meta--eyebrow">Kategori Koleksi</p>
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
        return "Dipinjam";
    }

    if (status === "unavailable") {
        return "Tidak Tersedia";
    }

    if (status === "external") {
        return "Online";
    }

    return "Tersedia";
}

function getDisplayStatus(baseAvailability, userState) {
    return userState === "borrowed" ? "borrowed" : baseAvailability;
}

function getActionLabel(baseAvailability, userState) {
    if (!currentUser) {
        return baseAvailability === "available" ? "Masuk untuk Pinjam" : "Masuk untuk Antre";
    }

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
            ? "Masuk dulu untuk meminjam buku ini."
            : "Masuk dulu untuk masuk ke antrean buku ini.";
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
    const ratingSummaryText = getBookRatingSummaryText(book.id);

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
                <p class="book-meta book-rating-summary" data-book-rating-summary>${escapeHtml(ratingSummaryText)}</p>
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
        const ratingSummary = card.querySelector("[data-book-rating-summary]");

        syncStatusChip(statusChip, displayStatus);

        if (actionButton) {
            actionButton.textContent = getActionLabel(baseAvailability, userState);
            actionButton.classList.toggle("is-borrowed", userState === "borrowed");
            actionButton.classList.toggle("is-waiting", userState === "waiting");
        }

        if (stateLabel) {
            stateLabel.textContent = getStateText(baseAvailability, userState);
        }

        if (ratingSummary) {
            ratingSummary.textContent = getBookRatingSummaryText(bookId);
        }
    });
}

function buildUserLibraryEntries() {
    return LIBRARY_BOOKS.map((book) => {
        const state = getUserBookState(book.id);
        const borrowMeta = getBorrowMeta(book.id);
        const userReview = getUserReview(book.id);

        if (state === "none" && !userReview) {
            return null;
        }

        return {
            book: book,
            state: state,
            borrowMeta: borrowMeta,
            userReview: userReview,
            ratingSummary: getBookRatingSummary(book.id)
        };
    })
        .filter(Boolean)
        .sort((left, right) => {
            const leftPriority = left.state === "borrowed" ? 0 : left.state === "waiting" ? 1 : 2;
            const rightPriority = right.state === "borrowed" ? 0 : right.state === "waiting" ? 1 : 2;

            if (leftPriority !== rightPriority) {
                return leftPriority - rightPriority;
            }

            const leftDate = left.borrowMeta && (left.borrowMeta.updatedAt || left.borrowMeta.borrowedAt || left.borrowMeta.queuedAt)
                ? new Date(left.borrowMeta.updatedAt || left.borrowMeta.borrowedAt || left.borrowMeta.queuedAt).getTime()
                : left.userReview
                    ? new Date(left.userReview.updatedAt || left.userReview.createdAt).getTime()
                    : 0;
            const rightDate = right.borrowMeta && (right.borrowMeta.updatedAt || right.borrowMeta.borrowedAt || right.borrowMeta.queuedAt)
                ? new Date(right.borrowMeta.updatedAt || right.borrowMeta.borrowedAt || right.borrowMeta.queuedAt).getTime()
                : right.userReview
                    ? new Date(right.userReview.updatedAt || right.userReview.createdAt).getTime()
                    : 0;

            return rightDate - leftDate;
        });
}

function buildReminderItems() {
    if (!currentUser) {
        return [];
    }

    const reminders = [];

    buildUserLibraryEntries().forEach((entry) => {
        if (entry.state === "borrowed") {
            const borrowedAt = entry.borrowMeta && entry.borrowMeta.borrowedAt ? entry.borrowMeta.borrowedAt : null;
            const dueAt = entry.borrowMeta && entry.borrowMeta.dueAt ? entry.borrowMeta.dueAt : null;
            const dueInDays = getDaysUntil(dueAt);
            const title = dueInDays !== null && dueInDays < 0
                ? "Masa pinjam sudah lewat"
                : dueInDays === 0
                    ? "Pengembalian jatuh tempo hari ini"
                    : "Pengingat pengembalian buku";
            let description = "Buku ini sedang ada di rak pinjam kamu.";
            let tone = "success";

            if (dueInDays !== null) {
                if (dueInDays < 0) {
                    tone = "danger";
                    description = "Segera kembalikan buku ini agar antrean anggota lain tetap berjalan lancar.";
                } else if (dueInDays <= 2) {
                    tone = "warning";
                    description = "Waktu pinjam hampir selesai. Siapkan pengembalian buku ini.";
                } else {
                    description = "Masih ada waktu untuk membaca sebelum batas pengembalian.";
                }
            }

            reminders.push({
                tone: tone,
                title: title,
                bookTitle: entry.book.title,
                detail: "Dipinjam " + formatDateLabel(borrowedAt, { dateStyle: "medium", timeStyle: "short" }) +
                    (dueAt ? " • Batas " + formatDateLabel(dueAt, { dateStyle: "medium" }) : ""),
                description: description,
                href: buildBookUrl(entry.book.id)
            });
        }

        if (entry.state === "waiting") {
            reminders.push({
                tone: "warning",
                title: "Buku masih dalam antrean",
                bookTitle: entry.book.title,
                detail: "Masuk antrean sejak " + formatDateLabel(entry.borrowMeta && entry.borrowMeta.queuedAt, { dateStyle: "medium", timeStyle: "short" }),
                description: "Kamu akan tetap melihat status antrean buku ini sampai memutuskan keluar dari daftar tunggu.",
                href: buildBookUrl(entry.book.id)
            });
        }

        if (entry.state === "borrowed" && !entry.userReview) {
            reminders.push({
                tone: "accent",
                title: "Jangan lupa beri ulasan",
                bookTitle: entry.book.title,
                detail: "Rating dan ulasan membantu anggota lain memilih buku yang tepat.",
                description: "Setelah selesai membaca, buka detail buku ini untuk memberi rating dan menulis ulasan singkat.",
                href: buildBookUrl(entry.book.id)
            });
        }
    });

    return reminders;
}

function renderLibraryEntryCard(entry) {
    const book = entry.book;
    const baseAvailability = normalizeText(book.status) || "available";
    const detailHref = buildBookUrl(book.id);
    const displayStatus = getDisplayStatus(baseAvailability, entry.state);
    const stateText = getStateText(baseAvailability, entry.state);
    const activityNote = entry.state === "borrowed"
        ? "Dipinjam pada " + formatDateLabel(entry.borrowMeta && entry.borrowMeta.borrowedAt, { dateStyle: "medium", timeStyle: "short" }) +
            (entry.borrowMeta && entry.borrowMeta.dueAt ? " • Batas " + formatDateLabel(entry.borrowMeta.dueAt, { dateStyle: "medium" }) : "")
        : entry.state === "waiting"
            ? "Masuk antrean pada " + formatDateLabel(entry.borrowMeta && entry.borrowMeta.queuedAt, { dateStyle: "medium", timeStyle: "short" })
            : "Belum ada status pinjam aktif.";
    const userReviewNote = entry.userReview
        ? '<div class="review-mini"><p class="review-mini__stars" aria-label="Rating pribadi ' + escapeHtml(String(entry.userReview.rating)) + ' dari 5">' + renderStars(entry.userReview.rating) + '</p><p class="review-mini__text">' + formatReviewText(entry.userReview.review) + '</p></div>'
        : '<p class="book-meta">Belum ada ulasan pribadi untuk buku ini.</p>';

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
                <p class="book-meta book-rating-summary">${escapeHtml(getBookRatingSummaryText(book.id))}</p>
                <p class="book-state" data-book-state>${escapeHtml(stateText)}</p>
                <p class="book-meta">${escapeHtml(activityNote)}</p>
                ${userReviewNote}
            </div>
            <div class="book-card__actions">
                <a class="text-button" href="${detailHref}">Lihat Detail</a>
                <a class="secondary-button secondary-button--surface button-link" href="${detailHref}">${entry.userReview ? "Ubah Ulasan" : "Beri Ulasan"}</a>
                <button class="primary-button book-action" type="button" data-book-action>${escapeHtml(getActionLabel(baseAvailability, entry.state))}</button>
            </div>
        </article>
    `;
}

function renderReminderCard(reminder) {
    return `
        <article class="reminder-card reminder-card--${escapeHtml(reminder.tone)}">
            <div class="activity-item__head">
                <div>
                    <p class="book-meta book-meta--eyebrow">${escapeHtml(reminder.title)}</p>
                    <h3 class="activity-item__title">${escapeHtml(reminder.bookTitle)}</h3>
                </div>
                <a class="text-button" href="${escapeHtml(reminder.href)}">Buka Buku</a>
            </div>
            <p class="book-meta">${escapeHtml(reminder.detail)}</p>
            <p class="section-text">${escapeHtml(reminder.description)}</p>
        </article>
    `;
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

function setupMyLibraryPage() {
    const libraryGrid = document.querySelector("[data-my-library-grid]");

    if (!libraryGrid) {
        return;
    }

    const summary = document.querySelector("[data-my-library-summary]");
    const emptyState = document.querySelector("[data-my-library-empty]");
    const reminderList = document.querySelector("[data-reminder-list]");
    const reminderSummary = document.querySelector("[data-reminder-summary]");
    const guestState = document.querySelector("[data-my-library-guest]");
    const borrowedCount = document.querySelector("[data-stat-borrowed-books]");
    const waitingCount = document.querySelector("[data-stat-waiting-books]");
    const reviewedCount = document.querySelector("[data-stat-reviewed-books]");
    const filterButtons = Array.from(document.querySelectorAll("[data-library-filter]"));

    function getVisibleEntries(entries) {
        if (myLibraryState.filter === "borrowed") {
            return entries.filter((entry) => entry.state === "borrowed");
        }

        if (myLibraryState.filter === "waiting") {
            return entries.filter((entry) => entry.state === "waiting");
        }

        if (myLibraryState.filter === "reviewed") {
            return entries.filter((entry) => Boolean(entry.userReview));
        }

        return entries;
    }

    function updateFilterButtons() {
        filterButtons.forEach((button) => {
            button.classList.toggle("is-selected", (button.dataset.libraryFilter || "all") === myLibraryState.filter);
        });
    }

    function renderLibrary() {
        updateFilterButtons();

        if (!currentUser) {
            if (guestState) guestState.hidden = false;
            if (summary) summary.textContent = "Masuk untuk melihat buku yang sedang dipinjam, antrean aktif, dan ulasan pribadimu.";
            if (libraryGrid) libraryGrid.innerHTML = "";
            if (emptyState) emptyState.hidden = true;
            if (reminderSummary) reminderSummary.textContent = "Notifikasi pribadi akan muncul setelah kamu masuk dan mulai meminjam buku.";
            if (reminderList) reminderList.innerHTML = '<div class="activity-empty">Belum ada notifikasi pribadi untuk ditampilkan.</div>';
            if (borrowedCount) borrowedCount.textContent = "0";
            if (waitingCount) waitingCount.textContent = "0";
            if (reviewedCount) reviewedCount.textContent = "0";
            return;
        }

        if (guestState) guestState.hidden = true;

        const allEntries = buildUserLibraryEntries();
        const visibleEntries = getVisibleEntries(allEntries);
        const reminders = buildReminderItems();
        const borrowedEntries = allEntries.filter((entry) => entry.state === "borrowed");
        const waitingEntries = allEntries.filter((entry) => entry.state === "waiting");
        const reviewedEntries = allEntries.filter((entry) => Boolean(entry.userReview));

        if (borrowedCount) borrowedCount.textContent = String(borrowedEntries.length);
        if (waitingCount) waitingCount.textContent = String(waitingEntries.length);
        if (reviewedCount) reviewedCount.textContent = String(reviewedEntries.length);

        if (summary) {
            summary.textContent = visibleEntries.length
                ? "Menampilkan " + visibleEntries.length + " buku di rak pribadi " + currentUser.name + "."
                : "Belum ada buku yang cocok dengan filter saat ini.";
        }

        if (libraryGrid) {
            libraryGrid.innerHTML = visibleEntries.map(renderLibraryEntryCard).join("");
        }

        if (emptyState) {
            emptyState.hidden = visibleEntries.length !== 0;
        }

        if (reminderSummary) {
            reminderSummary.textContent = reminders.length
                ? reminders.length + " pengingat aktif untuk membantumu mengelola pinjaman dan antrean."
                : "Belum ada pengingat aktif. Aktivitas pinjam dan antre akan muncul di sini.";
        }

        if (reminderList) {
            reminderList.innerHTML = reminders.length
                ? reminders.map(renderReminderCard).join("")
                : '<div class="activity-empty">Belum ada pengingat aktif. Coba pinjam buku atau masuk ke antrean terlebih dahulu.</div>';
        }
    }

    filterButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const requestedFilter = button.dataset.libraryFilter || "all";
            myLibraryState.filter = MY_LIBRARY_FILTERS.includes(requestedFilter) ? requestedFilter : "all";
            renderLibrary();
        });
    });

    document.addEventListener("libraspire:books-changed", renderLibrary);
    document.addEventListener("libraspire:auth-changed", renderLibrary);
    document.addEventListener("libraspire:reviews-changed", renderLibrary);
    renderLibrary();
}

function getModeDescription() {
    if (AUTH_MODE === "local") {
        return "Versi pratinjau aktif. Akun dan riwayat sementara disimpan di perangkat ini.";
    }

    return authServiceReady
        ? "Login anggota tersedia. Data akun, peminjaman, dan riwayat akan tersimpan di website."
        : "Fitur akun sedang tidak tersedia. Coba muat ulang halaman beberapa saat lagi.";
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
            : AUTH_MODE === "server" && !authServiceReady
                ? "Login belum tersedia"
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
        const directFileError = new Error("Fitur akun memerlukan website yang dijalankan melalui server.");
        directFileError.code = "AUTH_SERVICE_UNAVAILABLE";
        throw directFileError;
    }

    const requestOptions = {
        method: options && options.method ? options.method : "GET",
        credentials: "include",
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
        const connectionError = new Error("Layanan akun sedang tidak dapat dihubungi. Coba lagi beberapa saat.");
        connectionError.code = "AUTH_SERVICE_UNAVAILABLE";
        throw connectionError;
    }

    let data = {};

    try {
        data = await response.json();
    } catch (error) {
        data = {};
    }

    if (!response.ok) {
        throw new Error(data.message || "Permintaan akun belum dapat diproses.");
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
            const response = await apiRequest(mode === "register" ? API_PATHS.register : API_PATHS.login, {
                method: "POST",
                body: validation.payload
            });
            authServiceReady = true;
            currentUser = response.user || null;
            await refreshServerLibraryState();
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
        if (AUTH_MODE === "server" && error.code === "AUTH_SERVICE_UNAVAILABLE") {
            authServiceReady = false;
            resetServerLibraryState();
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
            if (AUTH_MODE === "server" && !authServiceReady) {
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
                    await apiRequest(API_PATHS.logout, { method: "POST" });
                    authServiceReady = true;
                } catch (error) {
                    if (error.code === "AUTH_SERVICE_UNAVAILABLE") {
                        authServiceReady = false;
                    }
                }

                currentUser = null;
                resetServerLibraryState();

                if (authServiceReady) {
                    try {
                        await refreshServerLibraryState();
                    } catch (error) {
                        resetServerLibraryState();
                    }
                }
            }

            updateAuthUi();
            notifyAuthChanged();
            syncBookCards();
            notifyBooksChanged();
        });
    });

    if (AUTH_MODE === "server") {
        (async () => {
            try {
                const response = await apiRequest(API_PATHS.session);
                authServiceReady = true;
                currentUser = response.user || null;
                await refreshServerLibraryState();
            } catch (error) {
                if (error.code === "AUTH_SERVICE_UNAVAILABLE") {
                    authServiceReady = false;
                    currentUser = null;
                    resetServerLibraryState();
                } else {
                    authServiceReady = true;
                    currentUser = null;
                    await refreshServerLibraryState();
                }
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
                AUTH_MODE === "server" && !authServiceReady
                    ? getModeDescription()
                    : "Silakan masuk dulu sebelum meminjam buku.",
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

        (async () => {
            try {
                if (AUTH_MODE === "server") {
                    await updateServerUserBookState(bookId, nextState);
                } else {
                    if (!setUserBookState(bookId, nextState)) {
                        return;
                    }
                }

                trackBookActivity(activityAction, bookId);
                syncBookCards();
                notifyBooksChanged();
            } catch (error) {
                const message = error && error.message ? error.message : "Perubahan status buku belum berhasil disimpan.";
                openAuthModal(message, "error");
            }
        })();
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
        draftStatus.textContent = hasDraft ? "Draft pesan tersimpan otomatis di perangkat ini." : "";
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
        submissionNote.textContent = "Pesan terakhir dari " + latestMessage.name + " (" + latestMessage.email + ") tercatat pada " + sentDate + ". Total " + savedMessages.length + " pesan tersimpan di perangkat ini.";
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
    const categories = Array.isArray(volumeInfo.categories) && volumeInfo.categories.length ? volumeInfo.categories : ["Referensi Online"];
    const image = normalizeCoverUrl(volumeInfo.imageLinks && (volumeInfo.imageLinks.thumbnail || volumeInfo.imageLinks.smallThumbnail)) || createFallbackCover(volumeInfo.title);

    return {
        id: item.id,
        title: volumeInfo.title || "Judul Tidak Tersedia",
        author: Array.isArray(volumeInfo.authors) && volumeInfo.authors.length ? volumeInfo.authors.join(", ") : "Penulis belum tersedia",
        category: categories[0],
        description: rawDescription || "Belum ada deskripsi untuk referensi buku ini.",
        summary: rawDescription ? rawDescription.slice(0, 140) + (rawDescription.length > 140 ? "..." : "") : "Belum ada ringkasan untuk referensi buku ini.",
        cover: image,
        pages: volumeInfo.pageCount || null,
        published: volumeInfo.publishedDate || "Tidak diketahui",
        tags: categories.slice(0, 3),
        previewLink: volumeInfo.previewLink || volumeInfo.infoLink || "",
        sourceLabel: "Referensi Online"
    };
}

async function fetchExternalBooks(query) {
    const url = new URL(EXTERNAL_BOOKS_API);
    url.searchParams.set("q", query);
    url.searchParams.set("maxResults", "6");
    url.searchParams.set("printType", "books");

    const response = await fetch(url.toString());

    if (!response.ok) {
        throw new Error("Gagal mengambil rekomendasi buku.");
    }

    const data = await response.json();
    return Array.isArray(data.items) ? data.items.map(mapExternalBook) : [];
}

async function fetchExternalBookById(bookId) {
    const response = await fetch(EXTERNAL_BOOKS_API + "/" + encodeURIComponent(bookId));

    if (!response.ok) {
        throw new Error("Detail buku tidak ditemukan.");
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
                    <span class="status-chip external">Online</span>
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
            updateFeedback(feedback, "Masukkan topik atau judul terlebih dahulu.", "error");
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

        updateFeedback(feedback, "Mencari rekomendasi buku...", "success");

        try {
            const books = await fetchExternalBooks(finalQuery);
            updateFeedback(feedback, "", "");

            if (summary) {
                summary.hidden = false;
                summary.textContent = books.length + ' rekomendasi ditemukan untuk "' + finalQuery + '".';
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

function renderReviewList(bookId) {
    const reviews = getBookReviews(bookId);
    const activeUserKey = getActiveUserKey();

    if (!reviews.length) {
        return '<div class="activity-empty">Belum ada ulasan anggota untuk buku ini.</div>';
    }

    return reviews.map((review) => {
        const reviewDate = formatDateLabel(review.updatedAt || review.createdAt, { dateStyle: "medium", timeStyle: "short" });
        const isOwnReview = activeUserKey && normalizeText(review.userEmail) === activeUserKey;

        return `
            <article class="review-card ${isOwnReview ? "review-card--owned" : ""}">
                <div class="activity-item__head">
                    <div>
                        <p class="book-meta book-meta--eyebrow">${isOwnReview ? "Ulasan Saya" : "Ulasan Anggota"}</p>
                        <h3 class="activity-item__title">${escapeHtml(review.userName || review.userEmail || "Anggota LibrAspire")}</h3>
                    </div>
                    <p class="review-card__rating" aria-label="Rating ${escapeHtml(String(review.rating))} dari 5">${renderStars(review.rating)}</p>
                </div>
                <p class="book-meta">${escapeHtml(reviewDate)}</p>
                <p class="section-text">${formatReviewText(review.review)}</p>
            </article>
        `;
    }).join("");
}

function renderReviewComposer(bookId) {
    const userReview = getUserReview(bookId);
    const currentRating = userReview ? Number(userReview.rating) : 0;
    const currentReviewText = userReview ? userReview.review : "";
    const lastUpdated = userReview ? formatDateLabel(userReview.updatedAt || userReview.createdAt, { dateStyle: "medium", timeStyle: "short" }) : "";

    if (!currentUser) {
        return `
            <div class="activity-empty">
                Masuk terlebih dahulu untuk memberi rating dan ulasan pada buku ini. Setelah login, form ulasan akan muncul di sini.
            </div>
        `;
    }

    return `
        <form class="review-form" data-review-form data-book-id="${escapeHtml(bookId)}" novalidate>
            <div class="form-field">
                <label class="form-label" for="review-rating-${escapeHtml(bookId)}">Rating</label>
                <select class="form-input" id="review-rating-${escapeHtml(bookId)}" name="rating" required>
                    <option value="">Pilih rating</option>
                    <option value="5" ${currentRating === 5 ? "selected" : ""}>5 - Sangat bagus</option>
                    <option value="4" ${currentRating === 4 ? "selected" : ""}>4 - Bagus</option>
                    <option value="3" ${currentRating === 3 ? "selected" : ""}>3 - Cukup</option>
                    <option value="2" ${currentRating === 2 ? "selected" : ""}>2 - Kurang</option>
                    <option value="1" ${currentRating === 1 ? "selected" : ""}>1 - Perlu ditingkatkan</option>
                </select>
            </div>
            <div class="form-field">
                <label class="form-label" for="review-text-${escapeHtml(bookId)}">Ulasan</label>
                <textarea class="form-textarea" id="review-text-${escapeHtml(bookId)}" name="review" rows="5" placeholder="Bagikan pengalaman membaca atau alasan kamu merekomendasikan buku ini...">${escapeHtml(currentReviewText)}</textarea>
            </div>
            <div class="review-form__footer">
                <button class="primary-button" type="submit">${userReview ? "Perbarui Ulasan" : "Kirim Ulasan"}</button>
                <p class="book-meta">${userReview ? "Ulasan terakhir diperbarui pada " + escapeHtml(lastUpdated) + "." : "Ulasanmu akan tampil untuk anggota lain di halaman detail buku."}</p>
            </div>
            <p class="form-feedback" data-review-feedback hidden></p>
        </form>
    `;
}

function renderBookReviewPanel(bookId) {
    const summary = getBookRatingSummary(bookId);
    const reviewCountText = summary.count
        ? formatRatingValue(summary.average) + "/5 dari " + summary.count + " ulasan"
        : "Belum ada rating untuk buku ini";

    return `
        <section class="review-panel" data-review-panel="${escapeHtml(bookId)}">
            <div class="section-heading">
                <p class="section-kicker">Rating dan Ulasan</p>
                <h3 class="section-title review-panel__title">Pendapat Anggota</h3>
                <p class="section-text">Baca kesan anggota lain atau tulis ulasanmu sendiri setelah login.</p>
            </div>
            <div class="review-panel__summary">
                <div>
                    <p class="review-panel__score">${summary.count ? formatRatingValue(summary.average) : "--"}</p>
                    <p class="review-panel__stars" aria-label="${escapeHtml(reviewCountText)}">${renderStars(summary.count ? Math.round(summary.average) : 0)}</p>
                </div>
                <p class="catalog-summary">${escapeHtml(reviewCountText)}</p>
            </div>
            <div class="review-layout">
                <div class="review-layout__form">
                    ${renderReviewComposer(bookId)}
                </div>
                <div class="review-layout__list">
                    ${renderReviewList(bookId)}
                </div>
            </div>
        </section>
    `;
}

function setupReviewForms() {
    document.addEventListener("submit", (event) => {
        const reviewForm = event.target.closest("[data-review-form]");

        if (!reviewForm) {
            return;
        }

        event.preventDefault();

        if (!currentUser) {
            openAuthModal("Masuk dulu sebelum memberi rating dan ulasan.", "error");
            return;
        }

        const bookId = reviewForm.dataset.bookId || "";
        const formData = new FormData(reviewForm);
        const feedback = reviewForm.querySelector("[data-review-feedback]");
        const payload = {
            rating: formData.get("rating"),
            review: formData.get("review")
        };

        (async () => {
            try {
                const result = AUTH_MODE === "server"
                    ? await submitServerBookReview(bookId, payload)
                    : upsertBookReview(bookId, payload);

                if (!result.ok) {
                    updateFeedback(feedback, result.message, "error");
                    return;
                }

                updateFeedback(feedback, "Ulasan berhasil disimpan.", "success");
                notifyReviewsChanged(bookId);
                syncBookCards();
                notifyBooksChanged();
            } catch (error) {
                updateFeedback(feedback, error && error.message ? error.message : "Ulasan belum berhasil disimpan.", "error");
            }
        })();
    });
}

function renderDetailView(detail) {
    const isLocal = detail.type === "local";
    const book = detail.book;
    const displayStatus = isLocal ? getDisplayStatus(normalizeText(book.status), getUserBookState(book.id)) : "external";
    const metaItems = [];
    const ratingSummaryText = isLocal ? getBookRatingSummaryText(book.id) : "Buku referensi online";

    if (book.pages) {
        metaItems.push(`<span class="detail-meta">${escapeHtml(String(book.pages))} halaman</span>`);
    }

    if (book.published) {
        metaItems.push(`<span class="detail-meta">Terbit ${escapeHtml(String(book.published))}</span>`);
    }

    metaItems.push(`<span class="detail-meta">${isLocal ? "Koleksi LibrAspire" : "Referensi online"}</span>`);
    metaItems.push(`<span class="detail-meta">${escapeHtml(ratingSummaryText)}</span>`);

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
    const reviewPanel = isLocal ? renderBookReviewPanel(book.id) : "";

    return `
        <div class="detail-layout" ${localDataAttributes}>
            <div class="detail-cover-shell">
                <img class="detail-cover" src="${escapeHtml(book.cover)}" alt="Cover buku ${escapeHtml(book.title)}">
            </div>
            <div class="detail-copy">
                <p class="section-kicker">${isLocal ? "Koleksi Utama" : "Referensi Online"}</p>
                <div class="detail-heading-row">
                    <h2 class="section-title">${escapeHtml(book.title)}</h2>
                    <span class="status-chip ${displayStatus}">${getBookStatusLabel(displayStatus)}</span>
                </div>
                <p class="detail-byline">${escapeHtml(book.author)} - ${escapeHtml(book.category)}</p>
                <p class="section-text">${escapeHtml(book.description)}</p>
                <div class="detail-meta-list">${metaItems.join("")}</div>
                <div class="detail-tag-list">${tags}</div>
                <p class="book-state" data-book-state>${isLocal ? escapeHtml(getStateText(normalizeText(book.status), getUserBookState(book.id))) : "Buku ini tersedia sebagai referensi online dan tidak masuk ke layanan peminjaman LibrAspire."}</p>
                <div class="detail-actions">${actions}</div>
                <p class="detail-note">${isLocal ? "Status pinjam buku akan selalu mengikuti akun yang sedang kamu gunakan." : "Detail ini diambil dari sumber bacaan online untuk membantu kamu menemukan referensi tambahan."}</p>
            </div>
        </div>
        ${reviewPanel}
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
        throw new Error("Buku tidak ditemukan. Silakan buka kembali dari halaman katalog.");
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
    let currentDetail = null;

    function renderLoadedDetail() {
        if (!currentDetail) {
            return;
        }

        detailView.innerHTML = renderDetailView(currentDetail);
        detailView.hidden = false;

        if (relatedSection && relatedGrid) {
            const relatedBooks = currentDetail.type === "local" ? buildRelatedBooks(currentDetail.book) : LIBRARY_BOOKS.slice(0, 3);
            relatedGrid.innerHTML = relatedBooks.map((book) => renderLocalBookCard(book)).join("");
            relatedSection.hidden = false;
        }

        syncBookCards();
    }

    async function loadDetail() {
        if (loading) loading.hidden = false;
        detailView.hidden = true;
        updateFeedback(error, "", "");

        try {
            currentDetail = await getDetailData();
            renderLoadedDetail();
            if (loading) loading.hidden = true;
        } catch (detailError) {
            if (loading) loading.hidden = true;
            detailView.hidden = true;
            updateFeedback(error, detailError.message, "error");
            if (relatedSection) relatedSection.hidden = true;
        }
    }

    loadDetail();
    document.addEventListener("libraspire:books-changed", renderLoadedDetail);
    document.addEventListener("libraspire:auth-changed", renderLoadedDetail);
    document.addEventListener("libraspire:reviews-changed", (event) => {
        if (!currentDetail || currentDetail.type !== "local") {
            return;
        }

        if (event.detail && event.detail.bookId && normalizeText(event.detail.bookId) !== normalizeText(currentDetail.book.id)) {
            return;
        }

        renderLoadedDetail();
    });
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
    setupMyLibraryPage();
    setupDiscoverySection();
    setupContactForm();
    setupBookActions();
    setupReviewForms();
    setupDetailPage();
    syncBookCards();
    document.addEventListener("libraspire:books-changed", renderSiteStats);
    document.addEventListener("libraspire:books-changed", renderCategoryOverview);
    document.addEventListener("libraspire:books-changed", renderActivityFeed);
    document.addEventListener("libraspire:auth-changed", renderActivityFeed);
    document.addEventListener("libraspire:reviews-changed", syncBookCards);
    updateAuthUi();
    setupAuth();
}

init();
