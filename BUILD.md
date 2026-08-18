# Building the Windows Installer

This produces a standard Windows `Setup.exe` (NSIS, per-user install) for the
Taxpayer Record System.

## Prerequisites (one time)

- Windows 10/11 (64-bit)
- Node.js 18+ and npm
- The build tools that native modules (`better-sqlite3`) need. The easiest way
  is to install Node.js with the **"Automatically install the necessary tools"**
  checkbox ticked, which installs Visual Studio Build Tools + Python.

## Build steps

From the project root, in a terminal:

```bash
# 1. Install dependencies. The postinstall step rebuilds better-sqlite3
#    against Electron's runtime automatically.
npm install

# 2. Build the React client and package the installer in one command.
npm run dist
```

The finished installer is written to:

```
release\TaxpayerRecordSystem-Setup-1.0.0.exe
```

Double-click it to install. It installs per-user (no administrator password
required) and creates Start Menu and desktop shortcuts.

## Where data is stored

The database and automatic backups live in the current Windows user's
application-data folder, which is always writable:

```
%APPDATA%\Taxpayer Record System\database\taxpayer.db
%APPDATA%\Taxpayer Record System\backups\
```

The installed program files themselves are never written to, so the app works
correctly even when installed for a non-administrator office account.

## First login

On a fresh install the app creates a default administrator:

- **Username:** `admin`
- **Password:** `admin123`

Change this password immediately after the first login.

## Notes

- To bump the version shown in the installer filename and "Add or Remove
  Programs", edit `"version"` in `package.json`, then run `npm run dist` again.
- `npm run dev` still runs the full dev environment (Vite + Express + Electron)
  against the repo-local `database/` folder, unchanged.
