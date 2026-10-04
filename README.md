# FixHub – Reliable Appliance Repair, Right When You Need It
College project: customers, vendors and admin for appliance repair.

## Run
1. `npm install`  2. copy `.env.example` to `.env`  3. `npm run dev`  4. open http://localhost:5000
(Internet needed once per load for Bootstrap / bcryptjs CDN files.)

## Demo accounts (local demo only)
| Role | Email | Password |
|---|---|---|
| Admin | admin@fixhub.local | Admin@123 |
| Vendor | vendor@fixhub.local | Vendor@123 |
| Customer | user@fixhub.local | User@123 |
To reset all data: DevTools > Application > IndexedDB > delete FixHubDB, then refresh.

## Architecture (current)
- `client/js/db.js` – IndexedDB layer (FixHubDB, 9 stores): initializeDB, addRecord, getRecord, getAllRecords, updateRecord, deleteRecord, queryRecords.
- `client/js/seed.js` – demo data. `client/js/app.js` – pages, router, business rules (status transitions, ratings, notifications).
- Passwords hashed with bcryptjs; role is never read from forms; users can only open their own bookings.
- `server/` – Express skeleton (`/api/health`, JSON response + error handling). Business APIs are NOT implemented yet.

## Known limitations
- App runs in browser-only mode: no JWT / REST routes yet, so security is demo-grade (client-side checks).
- Not covered yet: forgot password, profile/settings pages, payments/reports admin pages, services CRUD UI, vendor profile editing.
