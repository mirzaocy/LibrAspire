const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { URL } = require("url");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8000);
const BASE_DIR = __dirname;
const USERS_FILE = path.join(BASE_DIR, "users.json");
const LIBRARY_FILE = path.join(BASE_DIR, "library-data.json");
const SESSION_COOKIE_NAME = "libraspire_session";
const SESSION_MAX_AGE = 60 * 60 * 24;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSIONS = new Map();
const MIME_TYPES = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".webp": "image/webp"
};

function ensureFile(filePath, fallbackValue) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(fallbackValue, null, 2), "utf8");
    }
}

function readJsonFile(filePath, fallbackValue) {
    ensureFile(filePath, fallbackValue);

    try {
        const rawValue = fs.readFileSync(filePath, "utf8");
        const parsedValue = JSON.parse(rawValue);
        return parsedValue && typeof parsedValue === "object" ? parsedValue : fallbackValue;
    } catch (error) {
        return fallbackValue;
    }
}

function writeJsonFile(filePath, value) {
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function loadUsers() {
    const users = readJsonFile(USERS_FILE, []);
    return Array.isArray(users) ? users : [];
}

function saveUsers(users) {
    writeJsonFile(USERS_FILE, users);
}

function loadLibraryStore() {
    const data = readJsonFile(LIBRARY_FILE, {
        userBooks: {},
        userBookMeta: {},
        reviews: {}
    });

    return {
        userBooks: data.userBooks && typeof data.userBooks === "object" ? data.userBooks : {},
        userBookMeta: data.userBookMeta && typeof data.userBookMeta === "object" ? data.userBookMeta : {},
        reviews: data.reviews && typeof data.reviews === "object" ? data.reviews : {}
    };
}

function saveLibraryStore(store) {
    writeJsonFile(LIBRARY_FILE, store);
}

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function normalizeId(value) {
    return String(value || "").trim().toLowerCase();
}

function isEmailValid(email) {
    return EMAIL_PATTERN.test(normalizeEmail(email));
}

function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(String(password || ""), String(salt || ""), 120000, 32, "sha256").toString("hex");
}

function buildPublicUser(user) {
    return user ? { name: user.name, email: user.email } : null;
}

function cleanupSessions() {
    const now = Date.now();

    for (const [token, session] of SESSIONS.entries()) {
        if (!session || session.expiresAt <= now) {
            SESSIONS.delete(token);
        }
    }
}

function parseCookies(request) {
    const cookieHeader = request.headers.cookie || "";
    const cookies = {};

    cookieHeader.split(";").forEach((part) => {
        const separatorIndex = part.indexOf("=");

        if (separatorIndex === -1) {
            return;
        }

        const key = part.slice(0, separatorIndex).trim();
        const value = part.slice(separatorIndex + 1).trim();
        cookies[key] = decodeURIComponent(value);
    });

    return cookies;
}

function getSessionToken(request) {
    const cookies = parseCookies(request);
    return cookies[SESSION_COOKIE_NAME] || "";
}

function getCurrentUser(request) {
    cleanupSessions();
    const sessionToken = getSessionToken(request);

    if (!sessionToken || !SESSIONS.has(sessionToken)) {
        return null;
    }

    const session = SESSIONS.get(sessionToken);
    const users = loadUsers();
    return users.find((user) => normalizeEmail(user.email) === normalizeEmail(session.email)) || null;
}

function createSessionCookie(user) {
    cleanupSessions();
    const token = crypto.randomBytes(32).toString("base64url");
    SESSIONS.set(token, {
        email: user.email,
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_MAX_AGE * 1000
    });

    return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

function clearSessionCookie(request) {
    const token = getSessionToken(request);

    if (token) {
        SESSIONS.delete(token);
    }

    return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

function readRequestBody(request) {
    return new Promise((resolve, reject) => {
        const chunks = [];

        request.on("data", (chunk) => {
            chunks.push(chunk);
        });

        request.on("end", () => {
            if (!chunks.length) {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
            } catch (error) {
                reject(new Error("Format JSON tidak valid."));
            }
        });

        request.on("error", reject);
    });
}

function sendJson(response, statusCode, payload, extraHeaders = {}) {
    const body = Buffer.from(JSON.stringify(payload), "utf8");

    response.writeHead(statusCode, {
        "Cache-Control": "no-store",
        "Content-Length": body.length,
        "Content-Type": "application/json; charset=utf-8",
        ...extraHeaders
    });
    response.end(body);
}

function sendText(response, statusCode, message) {
    response.writeHead(statusCode, {
        "Content-Type": "text/plain; charset=utf-8"
    });
    response.end(message);
}

function buildLibraryState(user) {
    const store = loadLibraryStore();
    const userKey = user ? normalizeEmail(user.email) : "";

    return {
        userBooks: userKey ? store.userBooks[userKey] || {} : {},
        userBookMeta: userKey ? store.userBookMeta[userKey] || {} : {},
        reviews: store.reviews || {}
    };
}

function addDays(dateValue, days) {
    const nextDate = new Date(dateValue);
    nextDate.setDate(nextDate.getDate() + days);
    return nextDate.toISOString();
}

function handleRegister(request, response) {
    readRequestBody(request)
        .then((payload) => {
            const name = String(payload.name || "").trim();
            const email = normalizeEmail(payload.email);
            const password = String(payload.password || "");

            if (name.length < 3) {
                sendJson(response, 400, { message: "Nama minimal 3 karakter." });
                return;
            }

            if (!email) {
                sendJson(response, 400, { message: "Email wajib diisi." });
                return;
            }

            if (!isEmailValid(email)) {
                sendJson(response, 400, { message: "Format email tidak valid." });
                return;
            }

            if (password.length < 6) {
                sendJson(response, 400, { message: "Password minimal 6 karakter." });
                return;
            }

            const users = loadUsers();

            if (users.some((user) => normalizeEmail(user.email) === email)) {
                sendJson(response, 409, { message: "Email sudah terdaftar. Silakan login." });
                return;
            }

            const salt = crypto.randomBytes(16).toString("hex");
            const newUser = {
                name: name,
                email: email,
                salt: salt,
                passwordHash: hashPassword(password, salt),
                createdAt: new Date().toISOString()
            };

            users.push(newUser);
            saveUsers(users);

            sendJson(response, 201, {
                message: "Akun berhasil dibuat.",
                user: buildPublicUser(newUser)
            }, {
                "Set-Cookie": createSessionCookie(newUser)
            });
        })
        .catch((error) => {
            sendJson(response, 400, { message: error.message || "Permintaan tidak valid." });
        });
}

function handleLogin(request, response) {
    readRequestBody(request)
        .then((payload) => {
            const email = normalizeEmail(payload.email);
            const password = String(payload.password || "");

            if (!email) {
                sendJson(response, 400, { message: "Email wajib diisi." });
                return;
            }

            if (!password) {
                sendJson(response, 400, { message: "Password wajib diisi." });
                return;
            }

            const users = loadUsers();
            const matchedUser = users.find((user) => normalizeEmail(user.email) === email);

            if (!matchedUser) {
                sendJson(response, 401, { message: "Akun belum ditemukan. Buat akun dulu ya." });
                return;
            }

            if (hashPassword(password, matchedUser.salt) !== matchedUser.passwordHash) {
                sendJson(response, 401, { message: "Password salah." });
                return;
            }

            sendJson(response, 200, {
                message: "Login berhasil.",
                user: buildPublicUser(matchedUser)
            }, {
                "Set-Cookie": createSessionCookie(matchedUser)
            });
        })
        .catch((error) => {
            sendJson(response, 400, { message: error.message || "Permintaan tidak valid." });
        });
}

function handleLogout(request, response) {
    sendJson(response, 200, { message: "Logout berhasil." }, {
        "Set-Cookie": clearSessionCookie(request)
    });
}

function handleSession(request, response) {
    const user = getCurrentUser(request);
    sendJson(response, 200, {
        authenticated: Boolean(user),
        user: buildPublicUser(user)
    });
}

function handleLibraryState(request, response) {
    const user = getCurrentUser(request);
    sendJson(response, 200, buildLibraryState(user));
}

function handleUpdateBookState(request, response, pathname) {
    const user = getCurrentUser(request);

    if (!user) {
        sendJson(response, 401, { message: "Masuk dulu sebelum meminjam atau masuk antrean." });
        return;
    }

    const match = pathname.match(/^\/api\/my-books\/([^/]+)\/state$/);
    const bookId = match ? normalizeId(decodeURIComponent(match[1])) : "";

    if (!bookId) {
        sendJson(response, 400, { message: "Buku tidak valid." });
        return;
    }

    readRequestBody(request)
        .then((payload) => {
            const nextState = normalizeId(payload.state);
            const allowedStates = new Set(["borrowed", "waiting", "none"]);

            if (!allowedStates.has(nextState)) {
                sendJson(response, 400, { message: "Status buku tidak valid." });
                return;
            }

            const store = loadLibraryStore();
            const userKey = normalizeEmail(user.email);
            const userBooks = { ...(store.userBooks[userKey] || {}) };
            const userBookMeta = { ...(store.userBookMeta[userKey] || {}) };
            const currentMeta = userBookMeta[bookId] || {};
            const timestamp = new Date().toISOString();

            if (nextState === "none") {
                delete userBooks[bookId];
                delete userBookMeta[bookId];
            } else {
                userBooks[bookId] = nextState;

                if (nextState === "borrowed") {
                    userBookMeta[bookId] = {
                        status: "borrowed",
                        updatedAt: timestamp,
                        borrowedAt: timestamp,
                        queuedAt: currentMeta.queuedAt || null,
                        dueAt: addDays(timestamp, 7)
                    };
                }

                if (nextState === "waiting") {
                    userBookMeta[bookId] = {
                        status: "waiting",
                        updatedAt: timestamp,
                        queuedAt: currentMeta.queuedAt || timestamp,
                        borrowedAt: currentMeta.borrowedAt || null,
                        dueAt: currentMeta.dueAt || null
                    };
                }
            }

            if (Object.keys(userBooks).length) {
                store.userBooks[userKey] = userBooks;
            } else {
                delete store.userBooks[userKey];
            }

            if (Object.keys(userBookMeta).length) {
                store.userBookMeta[userKey] = userBookMeta;
            } else {
                delete store.userBookMeta[userKey];
            }

            saveLibraryStore(store);
            sendJson(response, 200, buildLibraryState(user));
        })
        .catch((error) => {
            sendJson(response, 400, { message: error.message || "Permintaan tidak valid." });
        });
}

function handleUpsertReview(request, response, pathname) {
    const user = getCurrentUser(request);

    if (!user) {
        sendJson(response, 401, { message: "Masuk dulu sebelum memberi rating dan ulasan." });
        return;
    }

    const match = pathname.match(/^\/api\/books\/([^/]+)\/reviews$/);
    const bookId = match ? normalizeId(decodeURIComponent(match[1])) : "";

    if (!bookId) {
        sendJson(response, 400, { message: "Buku tidak valid." });
        return;
    }

    readRequestBody(request)
        .then((payload) => {
            const rating = Number(payload.rating);
            const reviewText = String(payload.review || "").trim();

            if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
                sendJson(response, 400, { message: "Pilih rating antara 1 sampai 5." });
                return;
            }

            if (reviewText.length < 10) {
                sendJson(response, 400, { message: "Ulasan minimal 10 karakter." });
                return;
            }

            const store = loadLibraryStore();
            const reviews = Array.isArray(store.reviews[bookId]) ? [...store.reviews[bookId]] : [];
            const userKey = normalizeEmail(user.email);
            const existingIndex = reviews.findIndex((review) => normalizeEmail(review.userEmail) === userKey);
            const timestamp = new Date().toISOString();
            const nextReview = {
                id: existingIndex >= 0 ? reviews[existingIndex].id : `${bookId}-${Date.now().toString(36)}`,
                userName: user.name,
                userEmail: user.email,
                rating: rating,
                review: reviewText,
                createdAt: existingIndex >= 0 ? reviews[existingIndex].createdAt || timestamp : timestamp,
                updatedAt: timestamp
            };

            if (existingIndex >= 0) {
                reviews.splice(existingIndex, 1);
            }

            reviews.unshift(nextReview);
            store.reviews[bookId] = reviews;
            saveLibraryStore(store);

            sendJson(response, 200, {
                message: "Ulasan berhasil disimpan.",
                review: nextReview
            });
        })
        .catch((error) => {
            sendJson(response, 400, { message: error.message || "Permintaan tidak valid." });
        });
}

function serveStaticFile(request, response, pathname) {
    const requestPath = pathname === "/" ? "/home.html" : pathname;
    const resolvedPath = path.resolve(BASE_DIR, `.${requestPath}`);

    if (!resolvedPath.startsWith(BASE_DIR)) {
        sendText(response, 403, "Akses ditolak.");
        return;
    }

    fs.stat(resolvedPath, (error, stats) => {
        if (error || !stats.isFile()) {
            sendText(response, 404, "File tidak ditemukan.");
            return;
        }

        const extension = path.extname(resolvedPath).toLowerCase();
        const contentType = MIME_TYPES[extension] || "application/octet-stream";

        response.writeHead(200, {
            "Content-Type": contentType,
            "Content-Length": stats.size
        });

        fs.createReadStream(resolvedPath).pipe(response);
    });
}

function routeRequest(request, response) {
    const requestUrl = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);
    const pathname = requestUrl.pathname;

    if (request.method === "GET" && pathname === "/api/session") {
        handleSession(request, response);
        return;
    }

    if (request.method === "GET" && pathname === "/api/library-state") {
        handleLibraryState(request, response);
        return;
    }

    if (request.method === "POST" && pathname === "/api/register") {
        handleRegister(request, response);
        return;
    }

    if (request.method === "POST" && pathname === "/api/login") {
        handleLogin(request, response);
        return;
    }

    if (request.method === "POST" && pathname === "/api/logout") {
        handleLogout(request, response);
        return;
    }

    if (request.method === "POST" && /^\/api\/my-books\/[^/]+\/state$/.test(pathname)) {
        handleUpdateBookState(request, response, pathname);
        return;
    }

    if (request.method === "POST" && /^\/api\/books\/[^/]+\/reviews$/.test(pathname)) {
        handleUpsertReview(request, response, pathname);
        return;
    }

    if (pathname.startsWith("/api/")) {
        sendJson(response, 404, { message: "Endpoint tidak ditemukan." });
        return;
    }

    serveStaticFile(request, response, pathname);
}

ensureFile(USERS_FILE, []);
ensureFile(LIBRARY_FILE, {
    userBooks: {},
    userBookMeta: {},
    reviews: {}
});

const server = http.createServer(routeRequest);

server.listen(PORT, HOST, () => {
    console.log(`LibrAspire Node server aktif di http://${HOST}:${PORT}`);
    console.log(`Buka http://${HOST}:${PORT}/home.html di browser.`);
});
