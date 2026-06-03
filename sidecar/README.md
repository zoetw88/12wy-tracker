# 12WY sidecars

Python helper that talks to Strava and writes into the same SQLite DB
the Tauri desktop app uses.

```
sidecar/
├── strava_sync.py     Strava OAuth + activity pull
├── requirements.txt   deps
└── README.md          this file
```

## Strava

Pulls your activities into `strava_activities` via the official Strava
API. Free for personal use; rate-limited to 100 reads / 15 min, 1000 / day.

```bash
cd sidecar
pip install -r requirements.txt
python strava_sync.py auth                 # one-time browser OAuth
python strava_sync.py sync --days 30       # pulls into the Tauri DB
python strava_sync.py status               # token + last-sync info
```

The OAuth dance:

1. `auth` asks for your Client ID + Secret from
   <https://www.strava.com/settings/api>. Both go into the OS keyring
   (Windows Credential Manager / macOS Keychain) — never the filesystem.
2. Browser opens to Strava's authorize page with `activity:read_all` scope.
3. After you click "Authorize", Strava redirects to
   `http://127.0.0.1:8765/callback` where the script catches the code
   and exchanges it for access + refresh tokens.
4. `sync` thereafter uses the refresh token transparently; you do not
   need to re-auth unless you revoke access.
