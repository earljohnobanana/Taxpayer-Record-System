# Taxpayer Record System

Offline-first desktop application for the **Municipal Treasurer's Office of Santa Catalina, Negros Oriental**. It manages taxpayers, barangays, establishments, annual tax records, and payment records, and generates professional Excel reports.

## Features

- Manage taxpayers (owners), barangays, and establishments
- Annual tax records with full payment history (history is never deleted)
- Excel report generation
- Offline-first: runs locally with an embedded SQLite database

## Tech Stack

- **Desktop:** Electron
- **Frontend:** React + Vite, Tailwind CSS, shadcn/ui, React Router, TanStack Query, TanStack Table, React Hook Form + Zod, Recharts, Lucide React, Sonner
- **Backend:** Node.js + Express
- **Database:** SQLite with Drizzle ORM
- **Reports:** ExcelJS

## Data Model

- One owner (taxpayer) can own multiple establishments.
- One barangay contains multiple establishments.
- One establishment belongs to one barangay and one owner.
- One establishment has many yearly tax records.
- One tax record has many payment records.

## Getting Started

```bash
npm install       # install dependencies
npm run dev       # run in development
npm run build     # build the desktop application
```

See [BUILD.md](./BUILD.md) for detailed build and packaging instructions.

## Notes

The local SQLite database (`database/*.db`), backups, build output, and `node_modules` are intentionally excluded from version control via `.gitignore`. The database schema lives in `database/schema.sql`.
