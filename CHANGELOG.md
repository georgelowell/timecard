# Changelog

## [1.6.0] — 2026-04-06

### Changed

**Removed Product dimension — simplified to Category → Function**

- **`types/index.ts`**: Removed `Product` interface entirely
- **`app/api/products/route.ts`**: Deleted (GET/POST/PATCH routes no longer exist)
- **`components/FunctionSelector.tsx`**: Removed "Browse by Product" toggle and product accordion; removed `products` and `ProductWithFunctions` props; component now shows Recent + Browse by Category only; simpler internal state (no `mode`, no `expandedProducts`)
- **`components/CheckOutScreen.tsx`**: Removed `ProductWithFunctions` interface, `products` state, and `/api/products` fetch from `loadSurveyData`; `FunctionSelector` no longer receives a `products` prop
- **`app/dashboard/taxonomy/page.tsx`**: Removed Products tab, tab bar, all product state (`addingProduct`, `editingProductId`, `assigningFnsFor`, etc.), all product API calls, and `fnProductMap` product-name badge display; page is now a single-view Category → Function tree with `+ Add Category` always visible
- **`scripts/seed.ts`**: Removed `PRODUCTS` constant and product seeding block; `--clear` / `--reset` still deletes the `products` collection as a legacy cleanup step; `functionIdMap` removed (was only needed for product assignment)
- **`app/api/recent-functions/route.ts`**: No changes needed — already product-free
- TypeScript passes `npx tsc --noEmit` with zero errors

## [1.5.0] — 2026-04-06

### Added

**Timecard Edit Modal — Allocation Editing**
- Managers and admins can now edit time allocations directly in the timecard edit modal
- Existing allocations render as interactive sliders (same proportional logic as the checkout survey): move one slider and the others adjust; minimum 5% per function; live percentage display
- Remove a function from the allocation with the × button — percentage redistributes proportionally
- "Add a function" dropdown: all active functions grouped by category (optgroup); already-allocated functions are hidden from the list; selecting one adds it at an even split; resets after selection
- If a timecard has no allocations, the manager can build one from scratch using the add dropdown
- Save is blocked while allocations sum to less than 100% — amber warning shows the current total
- The Save button is disabled if allocations exist but are unbalanced
- `PATCH /api/timecards` now sets `allocationsEdited: true` whenever an allocations array is saved
- New "Alloc edited" badge (blue) in the timecards table for records where `allocationsEdited` is true
- Modal is now scrollable (`max-h-[90vh] overflow-y-auto`) to accommodate the extra section
- `allocationsEdited?: boolean` added to the `Timecard` type

## [1.4.0] — 2026-04-06

### Added

**Analytics Dashboard (`/dashboard/analytics`)**
- New "Analytics" tab in the manager and admin nav (after Reports, before Taxonomy)
- Filters: date range (defaults to current ET week), facility, employee; "Run" button with empty-date guard
- Employee dropdown auto-populates from employees found in the selected period
- Auto-runs on page load with the default week so data is visible immediately
- Section 1 — 4 summary cards: Total Hours Worked, Total Shifts, Avg Shift Length, Employees Worked
- Section 2 — Horizontal bar chart: Hours by Function (Chart.js, brand brown `#7B604B`)
- Section 3 — Donut chart: Hours by Category (brand palette), legend shows name + percentage
- Section 4 — Employee Breakdown table: Name, Hours (mono), Top Function, Shifts; alternating row colours; header in `near-black` with tan text
- Section 5 — Daily Hours Trend line chart (filled area, brand brown)
- All charts skip empty state and show "No shifts logged for this period." instead
- New API route `GET /api/analytics`: requires manager role; calculates all five sections in one round-trip; resolves function→category hierarchy from Firestore; generates full date range for daily trend (zero-fills missing days)
- Installed `chart.js` and `react-chartjs-2`

## [1.3.0] — 2026-04-06

### Added

**Feature 1 — Employee Status & Weekly Activity**
- Employee overview shows weekly hours (Mon–Sun ET) and shift count for the current week
- Recent activity feed shows last 8 clock-in/clock-out events with relative day labels (Today/Yesterday/day name)
- "See all" link opens the new History page
- All times displayed in Eastern Time via Intl API (no client-side library)

**Feature 2 — Employee History Page (`/dashboard/history`)**
- Full clock event log: each shift generates a clock-in row and a clock-out row
- Client-side pagination, 30 events per page
- Shows date, event type, ET time, facility name, map link (if location captured), Manual/Remote badges
- New "History" nav item visible to employees in DashboardNav

**Feature 3 — Forgot to Clock In (Already Checked Out)**
- Scan page detects when employee already completed a shift today (`lastCheckout` same-day check)
- Shows "Already clocked out" screen with option to log a missed clock-in
- Time picker pre-filled with today's date; validates clock-in < clock-out
- New `POST /api/manual-check-in`: creates completed timecard with `manualEntry: true`

**Feature 4 — Double Scan Confirmation**
- Scan page shows a confirmation screen before proceeding to clock-out when employee is already checked in
- "Clock out" proceeds to CheckOutScreen; "Not now" dismisses to dashboard

**Feature 5 — Forgot to Clock Out Yesterday**
- Scan page detects open shifts from a previous ET day (`openShiftFromPreviousDay` from `/api/checkin`)
- Shows date + time of the open shift; datetime-local picker defaults to 5 PM on the shift's date
- New `POST /api/close-shift`: closes old shift with `manualEntry: true`, validates checkOut > checkIn
- After closing, employee can choose to clock in for the current day

**Feature 6 — "Time Not Logged" Badge**
- Timecards table shows red "Time not logged" badge for checked-out records with no allocations

**Feature 7 — Remote Pending at Checkout**
- `remotePendingAtCheckout: true` flag stored when employee clocks out while remote approval is still pending
- "Remote pending" orange badge shown in timecards table

**Feature 8 — 12-Hour Long Shift Alert**
- New `GET /api/cron/check-long-shifts` secured by `x-cron-secret` header
- Sends manager email for any shift checked in for ≥ 12 hours without a clock-out
- `sentLongShiftAlert: true` flag prevents duplicate emails per shift

**Feature 9 — Manager Edit Modal**
- Edit button opens a modal dialog (replaces inline edit row)
- Datetime-local pickers labeled Eastern Time; values converted server-side via `fromETLocal()`
- Required edit note field; PATCH endpoint recalculates `totalHours` automatically
- "Edited" sage badge shown in timecards table; prior edit note shown read-only in modal
- Also shows "Manual entry" (amber) and "Remote pending" (orange) badges

**Feature 10 — Timezone: All UTC in Firestore, All Display in ET**
- `lib/tz.ts`: server-side helpers using `date-fns-tz` (`fromETLocal`, `toETLocal`, `etDateStr`, `isTodayET`, `isYesterdayET`, `formatTimeET`, `relDayLabel`, `forgotCheckOutLabel`, `getWeekStartUTC`)
- Client components use Intl API exclusively (`toETDatetimeLocal`, `formatTimeET`, `isTodayET`, `getTodayET`, `getYesterdayET`)
- `date-fns` and `date-fns-tz` added to dependencies

### Changed

- `EmployeeOverview` now accepts `weekStartUTC` prop (computed server-side); fetches weekly timecards only
- `app/dashboard/page.tsx` passes `weekStartUTC` from `getWeekStartUTC()` to `EmployeeOverview`
- `CheckInScreen` "success" state now navigates to `checkInDone` (not CheckOutScreen), avoiding accidental immediate checkout
- Timecards page filter panel now includes Employee ID input

## [1.2.0] — 2026-04-06

### Changed

**Check-Out Flow Redesign**
- Checkout is triggered immediately when the employee opens the checkout screen (no confirmation step)
- Sticky "You're clocked out. — Undo" banner at top: near-black bg, off-white text, tan "Undo" link
- Undo reverses the checkout (status → checked-in, clears checkOutTime/totalHours/allocations) via new `/api/undo-checkout`
- Scan page shows "Clocked back in." confirmation screen after undo
- `/api/checkout` POST no longer requires allocations; allocations saved separately via new PATCH endpoint
- Geolocation saved with allocations PATCH, not at initial clock-out

**Allocation Survey Redesign**
- "Same as last time" button (near-black) loads all functions + percentages from most recent shift instantly
- Recent functions shown as cards in a 2-column grid: function name, category name, "X% last shift", "Yesterday"/"Last shift" label
- "Save" button replaces "Review & confirm" and "Done for the day" — one tap submits after sliders reach 100%
- `/api/recent-functions` now returns `categoryName`, `lastUsedPercentage`, `lastShiftDate` per function, plus `lastShift` array for "Same as last time"

## [1.1.0] — 2026-04-05

### Changed

**Comprehensive UI Redesign**
- New brand palette: near-black (#231F20), warm-brown (#7B604B), sage (#777D64), tan (#C7AF87), off-white (#E9E8E0)
- Font stack: Inter (display/headings), Lora (body), Playfair Display (callout), JetBrains Mono (data)
- All pages and components rewritten: login, scan, check-in, check-out, all dashboard tabs
- No gradients; earthy, direct microcopy throughout
- Table headers use near-black bg with tan text; data cells use JetBrains Mono
- Status badges: sage (active/checked-in), tan (pending), off-white+border (completed)
- Allocation slider thumb: warm-brown with white border; track fill via CSS gradient

**Taxonomy Redesign (2-level)**
- Removed subcategory layer; taxonomy is now Category → Function only
- Added Products layer with function assignments (many-to-many)
- Taxonomy Editor split into Functions and Products tabs
- Seed script updated with `--reset` flag and flat taxonomy + products data

**Geolocation**
- Check-in and check-out both capture GPS coordinates (non-blocking, optional)
- 3-state UI indicator: Getting location / Location saved / No location
- Coordinates stored in Firestore on `checkInLocation` and `checkOutLocation`
- Timecards table shows "View map" link to Google Maps for located shifts
- Remote approval email includes check-in location link when available

**User Invites**
- Admins can pre-assign role and facility via email invite before first sign-in
- Invite stored in `user_invites` Firestore collection, consumed on first Google login
- Pending invites shown in Users tab with cancel option

**Facility Management**
- Admins can edit facility name/location inline on QR Code Manager
- Admins can deactivate or permanently delete facilities
- Guard: last remaining facility cannot be deleted

**API Fixes**
- `/api/recent-functions` always returns valid JSON `{"recent": []}` as fallback
- `/api/facilities` accepts `?id=` for single-document lookup (fixes scan page 404)
- Inactive taxonomy items filtered in memory on all GET routes (avoids Firestore composite index)

## [1.0.0] — 2026-04-05

### Added

**Auth & Role System**
- Google OAuth 2.0 via NextAuth.js, scoped to configurable Gmail domain
- JWT sessions with 30-day maxAge
- Firestore user documents with role (`employee`, `manager`, `admin`)
- First login auto-assigned `admin` role
- Server-side role enforcement on all API routes and dashboard pages
- Next.js middleware for route-level role protection

**Check-In / Check-Out Flow**
- QR code scan page (`/scan?facility=FACILITY_ID`) — handles both check-in and check-out
- Smart state detection: shows check-in screen if not checked in, check-out flow if checked in
- Check-in screen shows facility name, current time, and confirm button
- Remote check-in option with manager approval via email link

**Remote Check-In Approval**
- Status `pending-approval` written to Firestore
- Email sent to all configured manager addresses via Nodemailer/Gmail SMTP
- Approval link in email hits `/api/approve-remote` (requires manager session)
- Managers can also approve directly from the dashboard

**Time Allocation Sliders**
- Sticky slider panel at top of check-out screen
- Each selected function gets a slider (min 5%, sum always 100%)
- Proportional redistribution when any slider moves or a function is removed
- Live percentage labels update optimistically
- "Recent functions" section shows last 10 unique functions used

**Job Function Taxonomy**
- Three-level tree: Category → Subcategory → Function
- Collapsible accordion UI in function selector
- Seed script (`scripts/seed.ts`) with 5 categories, 12 subcategories, 35+ functions

**Manager Dashboard**
- Overview: today's attendance, pending remote approvals, one-tap approval
- Timecards: searchable/filterable table with inline editing (requires edit note)
- Reports: date-range report with total hours, shifts, employees, function breakdown bar chart
- CSV export with function-level allocation rows
- Taxonomy Editor: full tree viewer with add/rename/deactivate for all levels

**Admin Dashboard**
- All manager features plus:
- User Management: role assignment, facility assignment, activate/deactivate
- QR Code Manager: per-facility QR code download (1024×1024 PNG)
- Settings: environment variable documentation page

**Infrastructure**
- `Dockerfile` with multi-stage build, standalone Next.js output, runs on port 8080
- `cloudbuild.yaml` for Cloud Build CI/CD to Cloud Run with Secret Manager integration
- `.env.example` documenting all required environment variables
- `README.md` with full step-by-step GCP setup, OAuth config, first deploy, and QR code generation
