"""Strava → twelvewy.db sync.

Strava has an official OAuth 2.0 API. Personal use is free, rate-limited
to 100 reads / 15 min and 1000 / day — far above what daily sync needs.

Commands
    python strava_sync.py auth                    one-time browser-based auth
    python strava_sync.py sync --days 30          pull activities into the DB
    python strava_sync.py status                  show token + last sync info
    python strava_sync.py reset                   wipe stored tokens

The flow
    1. `auth` opens the Strava authorize URL in your default browser,
       starts a one-shot http server on http://127.0.0.1:8765/callback,
       waits for Strava to redirect back with ?code=…
    2. The code is exchanged for an access_token + refresh_token, both
       saved in the OS keyring (Windows Credential Manager).
    3. `sync` reads the refresh_token, exchanges for a fresh access_token
       if needed, and pulls activities since the last sync timestamp.

Stored in OS keyring under service "twelvewy-strava":
    client_id, client_secret, access_token, refresh_token, expires_at
"""

from __future__ import annotations

import argparse
import http.server
import json
import os
import sqlite3
import sys
import time
import traceback
import urllib.parse
import webbrowser
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

try:
    import httpx
    import truststore
    truststore.inject_into_ssl()
    import keyring
except ImportError as e:  # pragma: no cover
    sys.stderr.write(f"Missing dep: {e}\n  pip install -r requirements.txt\n")
    sys.exit(1)


PROGRAM_START = date(2026, 5, 26)
TOTAL_WEEKS = 12

KEYRING_SERVICE = "twelvewy-strava"
REDIRECT_HOST = "127.0.0.1"
REDIRECT_PORT = 8765
REDIRECT_URI = f"http://{REDIRECT_HOST}:{REDIRECT_PORT}/callback"

AUTHORIZE_URL = "https://www.strava.com/oauth/authorize"
TOKEN_URL = "https://www.strava.com/oauth/token"
API_BASE = "https://www.strava.com/api/v3"

REQUIRED_SCOPES = "activity:read_all,read"


# ---------------------------------------------------------------------------
# DB path
# ---------------------------------------------------------------------------

def db_path() -> Path:
    if sys.platform.startswith("win"):
        base = Path(os.environ.get("APPDATA") or (Path.home() / "AppData" / "Roaming"))
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME") or (Path.home() / ".local" / "share"))
    return base / "app.twelvewy.tracker" / "twelvewy.db"


# ---------------------------------------------------------------------------
# Credentials in keyring
# ---------------------------------------------------------------------------

def kget(name: str) -> str | None:
    return keyring.get_password(KEYRING_SERVICE, name)


def kset(name: str, value: str) -> None:
    keyring.set_password(KEYRING_SERVICE, name, value)


def kdel(name: str) -> None:
    try:
        keyring.delete_password(KEYRING_SERVICE, name)
    except keyring.errors.PasswordDeleteError:
        pass


def require_client() -> tuple[str, str]:
    cid = kget("client_id") or os.environ.get("STRAVA_CLIENT_ID")
    secret = kget("client_secret") or os.environ.get("STRAVA_CLIENT_SECRET")
    if not cid or not secret:
        raise RuntimeError(
            "Strava client credentials not stored. Run:\n"
            "  python strava_sync.py auth\n"
            "and enter your Client ID + Secret from "
            "https://www.strava.com/settings/api"
        )
    return cid, secret


# ---------------------------------------------------------------------------
# OAuth
# ---------------------------------------------------------------------------

class _CodeCatcher(http.server.BaseHTTPRequestHandler):
    captured: dict[str, str] = {}

    def do_GET(self):  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        if parsed.path != "/callback":
            self.send_response(404)
            self.end_headers()
            return
        code = qs.get("code", [None])[0]
        err = qs.get("error", [None])[0]
        scope = qs.get("scope", [None])[0] or ""
        body: str
        if err:
            _CodeCatcher.captured = {"error": err}
            body = f"<h2>Strava auth failed: {err}</h2>"
            self.send_response(400)
        elif not code:
            body = "<h2>missing code</h2>"
            self.send_response(400)
        else:
            _CodeCatcher.captured = {"code": code, "scope": scope}
            body = (
                "<html><body style='font-family:system-ui;background:#0a0606;color:#e8d4a5;"
                "padding:40px;text-align:center'>"
                "<h2 style='color:#fbbf24'>Strava connected ✓</h2>"
                "<p>You can close this tab and return to the terminal.</p>"
                "</body></html>"
            )
            self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def log_message(self, *a, **k):  # silence
        pass


def cmd_auth(args: argparse.Namespace) -> int:
    print("Strava OAuth setup")
    cid = kget("client_id")
    secret = kget("client_secret")
    if args.reset or not cid:
        cid = input(f"Client ID [{cid or ''}]: ").strip() or cid
    if args.reset or not secret:
        from getpass import getpass
        new_secret = getpass("Client Secret (paste once, stored in OS keyring): ").strip()
        if new_secret:
            secret = new_secret
    if not cid or not secret:
        print("Client ID + Secret are required.", file=sys.stderr)
        return 2
    kset("client_id", cid)
    kset("client_secret", secret)

    state = os.urandom(8).hex()
    params = {
        "client_id": cid,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "approval_prompt": "auto",
        "scope": REQUIRED_SCOPES,
        "state": state,
    }
    url = f"{AUTHORIZE_URL}?{urllib.parse.urlencode(params)}"
    print(f"\nOpening browser to authorize…\n  {url}\n")
    _CodeCatcher.captured = {}

    server = http.server.HTTPServer((REDIRECT_HOST, REDIRECT_PORT), _CodeCatcher)
    webbrowser.open(url)

    print(f"Waiting for redirect to {REDIRECT_URI} …")
    deadline = time.time() + 180
    while not _CodeCatcher.captured and time.time() < deadline:
        server.handle_request()
    server.server_close()

    captured = _CodeCatcher.captured
    if "error" in captured:
        print(f"Strava returned error: {captured['error']}", file=sys.stderr)
        return 3
    if "code" not in captured:
        print("Timed out waiting for Strava redirect.", file=sys.stderr)
        return 3
    granted = captured.get("scope", "")
    print(f"Got authorization code. Granted scopes: {granted}")
    if "activity:read_all" not in granted:
        print(
            "WARNING: 'activity:read_all' not in granted scopes. Activities may be limited.",
            file=sys.stderr,
        )

    # Exchange code for tokens
    r = httpx.post(TOKEN_URL, data={
        "client_id": cid,
        "client_secret": secret,
        "code": captured["code"],
        "grant_type": "authorization_code",
    }, timeout=15)
    if r.status_code != 200:
        print(f"Token exchange failed {r.status_code}: {r.text[:300]}", file=sys.stderr)
        return 4
    tok = r.json()
    kset("access_token", tok["access_token"])
    kset("refresh_token", tok["refresh_token"])
    kset("expires_at", str(tok["expires_at"]))
    kset("athlete_id", str((tok.get("athlete") or {}).get("id") or ""))
    print(f"OK. Tokens stored. Athlete: {tok.get('athlete', {}).get('username') or '?'}")
    return 0


def refreshed_access_token() -> str:
    cid, secret = require_client()
    access = kget("access_token")
    refresh = kget("refresh_token")
    expires_at = int(kget("expires_at") or "0")
    if not access or not refresh:
        raise RuntimeError("No tokens stored. Run: python strava_sync.py auth")
    # Refresh if within 5 minutes of expiry
    if time.time() < expires_at - 300:
        return access
    r = httpx.post(TOKEN_URL, data={
        "client_id": cid,
        "client_secret": secret,
        "refresh_token": refresh,
        "grant_type": "refresh_token",
    }, timeout=15)
    if r.status_code != 200:
        raise RuntimeError(f"refresh failed {r.status_code}: {r.text[:200]}")
    tok = r.json()
    kset("access_token", tok["access_token"])
    kset("refresh_token", tok["refresh_token"])
    kset("expires_at", str(tok["expires_at"]))
    return tok["access_token"]


# ---------------------------------------------------------------------------
# Sync
# ---------------------------------------------------------------------------

def cmd_sync(args: argparse.Namespace) -> int:
    db = db_path()
    if not db.exists():
        print(f"DB not found: {db}", file=sys.stderr)
        print("Open the Tauri app once so the schema is created.", file=sys.stderr)
        return 3

    try:
        access = refreshed_access_token()
    except Exception as e:
        print(str(e), file=sys.stderr)
        return 4

    days = max(1, args.days)
    after_dt = datetime.now(timezone.utc).timestamp() - days * 86400
    print(f"Pulling Strava activities after {datetime.fromtimestamp(after_dt, timezone.utc).isoformat()} …")

    client = httpx.Client(
        base_url=API_BASE,
        headers={"Authorization": f"Bearer {access}"},
        timeout=20,
    )
    conn = sqlite3.connect(str(db))
    ensure_schema(conn)

    inserted = 0
    page = 1
    error_msg: str | None = None
    success = True
    try:
        while True:
            r = client.get(
                "/athlete/activities",
                params={"after": int(after_dt), "per_page": 100, "page": page},
            )
            if r.status_code != 200:
                raise RuntimeError(f"{r.status_code}: {r.text[:200]}")
            batch = r.json()
            if not isinstance(batch, list) or not batch:
                break
            for a in batch:
                insert_activity(conn, a)
                inserted += 1
            print(f"  page {page}: +{len(batch)}")
            if len(batch) < 100:
                break
            page += 1
        log_sync(conn, days, True, None, inserted)
    except Exception:
        success = False
        error_msg = traceback.format_exc(limit=4)
        print(error_msg, file=sys.stderr)
        log_sync(conn, days, False, error_msg, inserted)
    finally:
        conn.commit()
        conn.close()
        client.close()

    if success:
        print(f"\nOK. {inserted} activity row(s) upserted.")
        return 0
    return 5


# ---------------------------------------------------------------------------
# DB
# ---------------------------------------------------------------------------

def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS strava_activities (
            activity_id     INTEGER PRIMARY KEY,
            date            TEXT,
            type            TEXT,
            sport_type      TEXT,
            name            TEXT,
            duration_min    REAL,
            distance_km     REAL,
            elev_gain_m     REAL,
            calories        REAL,
            avg_hr          REAL,
            max_hr          REAL,
            start_local     TEXT,
            raw_json        TEXT,
            synced_at       TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_strava_activities_date ON strava_activities(date);

        CREATE TABLE IF NOT EXISTS strava_sync_log (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
            days      INTEGER,
            inserted  INTEGER,
            success   INTEGER,
            error     TEXT
        );
        """
    )


def insert_activity(conn: sqlite3.Connection, a: dict) -> None:
    aid = a.get("id")
    if aid is None:
        return
    start_local = (a.get("start_date_local") or "")
    iso = start_local[:10] if start_local else ""
    conn.execute(
        """INSERT INTO strava_activities
             (activity_id, date, type, sport_type, name, duration_min, distance_km,
              elev_gain_m, calories, avg_hr, max_hr, start_local, raw_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(activity_id) DO UPDATE SET
             date = excluded.date, type = excluded.type, sport_type = excluded.sport_type,
             name = excluded.name, duration_min = excluded.duration_min,
             distance_km = excluded.distance_km, elev_gain_m = excluded.elev_gain_m,
             calories = excluded.calories, avg_hr = excluded.avg_hr, max_hr = excluded.max_hr,
             start_local = excluded.start_local, raw_json = excluded.raw_json,
             synced_at = CURRENT_TIMESTAMP""",
        (
            int(aid),
            iso,
            a.get("type"),
            a.get("sport_type"),
            a.get("name"),
            round((a.get("moving_time") or 0) / 60.0, 1),
            round((a.get("distance") or 0) / 1000.0, 3),
            a.get("total_elevation_gain"),
            a.get("calories"),
            a.get("average_heartrate"),
            a.get("max_heartrate"),
            start_local,
            json.dumps(a, ensure_ascii=False),
        ),
    )


def log_sync(conn: sqlite3.Connection, days: int, success: bool, error: str | None, inserted: int) -> None:
    conn.execute(
        "INSERT INTO strava_sync_log (days, inserted, success, error) VALUES (?, ?, ?, ?)",
        (days, inserted, 1 if success else 0, error),
    )


# ---------------------------------------------------------------------------
# Status / reset
# ---------------------------------------------------------------------------

def cmd_status(_args: argparse.Namespace) -> int:
    cid = kget("client_id")
    secret_present = bool(kget("client_secret"))
    access_present = bool(kget("access_token"))
    expires_at = int(kget("expires_at") or "0")
    print(f"DB target:      {db_path()}")
    print(f"Client ID:      {cid or '— not set'}")
    print(f"Client Secret:  {'present' if secret_present else '— not set'}")
    print(f"Access token:   {'present' if access_present else '— not set'}")
    if expires_at:
        dt = datetime.fromtimestamp(expires_at, timezone.utc).isoformat()
        valid = "valid" if time.time() < expires_at else "expired"
        print(f"Token expires:  {dt} ({valid})")
    db = db_path()
    if db.exists():
        try:
            conn = sqlite3.connect(str(db))
            row = conn.execute(
                "SELECT synced_at, days, inserted, success FROM strava_sync_log ORDER BY id DESC LIMIT 1"
            ).fetchone()
            if row:
                print(f"Last sync:      {row[0]}  days={row[1]}  inserted={row[2]}  success={bool(row[3])}")
            else:
                print("Last sync:      never")
            conn.close()
        except sqlite3.OperationalError:
            print("Last sync:      strava_sync_log table not yet created")
    return 0


def cmd_reset(_args: argparse.Namespace) -> int:
    for k in ("client_id", "client_secret", "access_token", "refresh_token", "expires_at", "athlete_id"):
        kdel(k)
    print("Cleared all stored Strava credentials.")
    return 0


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main() -> int:
    p = argparse.ArgumentParser(description="Strava → 12WY sync")
    sub = p.add_subparsers(dest="cmd", required=True)

    p_auth = sub.add_parser("auth", help="browser-based OAuth setup")
    p_auth.add_argument("--reset", action="store_true", help="reprompt for Client ID/Secret")
    p_auth.set_defaults(func=cmd_auth)

    p_sync = sub.add_parser("sync", help="pull recent activities into the DB")
    p_sync.add_argument("--days", type=int, default=30)
    p_sync.set_defaults(func=cmd_sync)

    p_status = sub.add_parser("status", help="show stored credential + last sync status")
    p_status.set_defaults(func=cmd_status)

    p_reset = sub.add_parser("reset", help="delete stored Strava credentials")
    p_reset.set_defaults(func=cmd_reset)

    args = p.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
