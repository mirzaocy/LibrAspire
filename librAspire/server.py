import hashlib
import json
import re
import secrets
import threading
import time
from datetime import datetime, timezone
from http import cookies
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent
USERS_FILE = BASE_DIR / "users.json"
SESSION_COOKIE_NAME = "libraspire_session"
SESSION_MAX_AGE = 60 * 60 * 24
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
SESSIONS = {}
SESSION_LOCK = threading.Lock()


def ensure_user_store():
    if not USERS_FILE.exists():
        USERS_FILE.write_text("[]", encoding="utf-8")


def load_users():
    ensure_user_store()

    try:
        users = json.loads(USERS_FILE.read_text(encoding="utf-8"))
        return users if isinstance(users, list) else []
    except json.JSONDecodeError:
        return []


def save_users(users):
    USERS_FILE.write_text(
        json.dumps(users, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )


def normalize_email(email):
    return str(email or "").strip().lower()


def is_email_valid(email):
    return bool(EMAIL_PATTERN.match(normalize_email(email)))


def hash_password(password, salt):
    password_bytes = str(password or "").encode("utf-8")
    salt_bytes = str(salt or "").encode("utf-8")
    return hashlib.pbkdf2_hmac("sha256", password_bytes, salt_bytes, 120000).hex()


def build_public_user(user):
    return {
        "name": user["name"],
        "email": user["email"]
    }


def cleanup_sessions():
    now = time.time()

    with SESSION_LOCK:
        expired_tokens = [
            token
            for token, session in SESSIONS.items()
            if session["expires_at"] <= now
        ]

        for token in expired_tokens:
            del SESSIONS[token]


class LibrAspireHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def read_json_body(self):
        content_length = int(self.headers.get("Content-Length", "0"))

        if content_length <= 0:
            return {}

        raw_body = self.rfile.read(content_length)

        try:
            return json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError as error:
            raise ValueError("Format JSON tidak valid.") from error

    def respond_json(self, status_code, payload, extra_headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")

        if extra_headers:
            for header_name, header_value in extra_headers.items():
                self.send_header(header_name, header_value)

        self.end_headers()
        self.wfile.write(body)

    def get_session_token(self):
        cookie_header = self.headers.get("Cookie")

        if not cookie_header:
            return ""

        parsed_cookie = cookies.SimpleCookie()
        parsed_cookie.load(cookie_header)
        session_cookie = parsed_cookie.get(SESSION_COOKIE_NAME)
        return session_cookie.value if session_cookie else ""

    def get_current_user(self):
        cleanup_sessions()
        session_token = self.get_session_token()

        if not session_token:
            return None

        with SESSION_LOCK:
            session = SESSIONS.get(session_token)

        if not session:
            return None

        users = load_users()

        for user in users:
            if user["email"] == session["email"]:
                return user

        return None

    def create_session_cookie(self, user):
        cleanup_sessions()
        session_token = secrets.token_urlsafe(32)

        with SESSION_LOCK:
            SESSIONS[session_token] = {
                "email": user["email"],
                "created_at": time.time(),
                "expires_at": time.time() + SESSION_MAX_AGE
            }

        return (
            f"{SESSION_COOKIE_NAME}={session_token}; Path=/; HttpOnly; "
            f"SameSite=Lax; Max-Age={SESSION_MAX_AGE}"
        )

    def clear_session_cookie(self):
        session_token = self.get_session_token()

        if session_token:
            with SESSION_LOCK:
                SESSIONS.pop(session_token, None)

        return (
            f"{SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; "
            "Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
        )

    def handle_register(self):
        try:
            payload = self.read_json_body()
        except ValueError as error:
            self.respond_json(400, {"message": str(error)})
            return

        name = str(payload.get("name", "")).strip()
        email = normalize_email(payload.get("email", ""))
        password = str(payload.get("password", ""))

        if len(name) < 3:
            self.respond_json(400, {"message": "Nama minimal 3 karakter."})
            return

        if not email:
            self.respond_json(400, {"message": "Email wajib diisi."})
            return

        if not is_email_valid(email):
            self.respond_json(400, {"message": "Format email tidak valid."})
            return

        if len(password) < 6:
            self.respond_json(400, {"message": "Password minimal 6 karakter."})
            return

        users = load_users()

        if any(user["email"] == email for user in users):
            self.respond_json(409, {"message": "Email sudah terdaftar. Silakan login."})
            return

        salt = secrets.token_hex(16)
        new_user = {
            "name": name,
            "email": email,
            "salt": salt,
            "password_hash": hash_password(password, salt),
            "created_at": datetime.now(timezone.utc).isoformat()
        }

        users.append(new_user)
        save_users(users)

        self.respond_json(
            201,
            {
                "message": "Akun berhasil dibuat.",
                "user": build_public_user(new_user)
            },
            {"Set-Cookie": self.create_session_cookie(new_user)}
        )

    def handle_login(self):
        try:
            payload = self.read_json_body()
        except ValueError as error:
            self.respond_json(400, {"message": str(error)})
            return

        email = normalize_email(payload.get("email", ""))
        password = str(payload.get("password", ""))

        if not email:
            self.respond_json(400, {"message": "Email wajib diisi."})
            return

        if not password:
            self.respond_json(400, {"message": "Password wajib diisi."})
            return

        users = load_users()
        matched_user = next((user for user in users if user["email"] == email), None)

        if not matched_user:
            self.respond_json(401, {"message": "Akun belum ditemukan. Buat akun dulu ya."})
            return

        hashed_password = hash_password(password, matched_user["salt"])

        if hashed_password != matched_user["password_hash"]:
            self.respond_json(401, {"message": "Password salah."})
            return

        self.respond_json(
            200,
            {
                "message": "Login berhasil.",
                "user": build_public_user(matched_user)
            },
            {"Set-Cookie": self.create_session_cookie(matched_user)}
        )

    def handle_logout(self):
        self.respond_json(
            200,
            {"message": "Logout berhasil."},
            {"Set-Cookie": self.clear_session_cookie()}
        )

    def handle_session(self):
        user = self.get_current_user()
        self.respond_json(
            200,
            {
                "authenticated": bool(user),
                "user": build_public_user(user) if user else None
            }
        )

    def do_GET(self):
        parsed_url = urlparse(self.path)

        if parsed_url.path == "/api/session":
            self.handle_session()
            return

        if parsed_url.path.startswith("/api/"):
            self.respond_json(404, {"message": "Endpoint tidak ditemukan."})
            return

        self.path = "/home.html" if parsed_url.path == "/" else parsed_url.path
        super().do_GET()

    def do_POST(self):
        parsed_url = urlparse(self.path)

        if parsed_url.path == "/api/register":
            self.handle_register()
            return

        if parsed_url.path == "/api/login":
            self.handle_login()
            return

        if parsed_url.path == "/api/logout":
            self.handle_logout()
            return

        self.respond_json(404, {"message": "Endpoint tidak ditemukan."})


def main():
    ensure_user_store()
    server = ThreadingHTTPServer(("127.0.0.1", 8000), LibrAspireHandler)
    print("LibrAspire backend aktif di http://127.0.0.1:8000")
    print("Buka http://127.0.0.1:8000/home.html di browser.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer dihentikan.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
