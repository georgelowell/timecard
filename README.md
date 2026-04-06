# Lowell Timecard

Employee time tracking web app for cannabis processing facilities. Employees check in and out by scanning a QR code posted at each facility. At check-out, they complete a time allocation survey using sliders to distribute their workday across job functions.

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Database:** Google Cloud Firestore
- **Auth:** Google OAuth 2.0 via NextAuth.js (scoped to company Gmail domain)
- **Hosting:** Google Cloud Run
- **Email:** Nodemailer via Gmail SMTP
- **QR Codes:** `qrcode` npm library
- **Styling:** Tailwind CSS

---

## Setup Guide

### 1. GCP Project Setup

```bash
# Create project
gcloud projects create YOUR_PROJECT_ID --name="Lowell Timecard"
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  firestore.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com

# Create Firestore database (Native mode)
gcloud firestore databases create --region=us-central1
```

### 2. Google OAuth Setup

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 Client ID → Web application
3. Add authorized redirect URI: `https://YOUR_DOMAIN/api/auth/callback/google`
4. Note your **Client ID** and **Client Secret**
5. Configure the OAuth consent screen with your company domain

### 3. Firebase Admin SDK

1. Go to [Firebase Console → Project Settings → Service Accounts](https://console.firebase.google.com)
2. Generate new private key → Download JSON
3. Extract `project_id`, `client_email`, and `private_key` from the JSON

### 4. Environment Variables

Copy `.env.example` to `.env.local` and fill in all values:

```bash
cp .env.example .env.local
```

Required variables:
| Variable | Description |
|---|---|
| `NEXTAUTH_URL` | Public URL of the app |
| `NEXTAUTH_SECRET` | Run `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | From OAuth credentials |
| `GOOGLE_CLIENT_SECRET` | From OAuth credentials |
| `ALLOWED_DOMAIN` | Company Gmail domain (e.g. `yourco.com`) |
| `FIREBASE_PROJECT_ID` | GCP project ID |
| `FIREBASE_CLIENT_EMAIL` | Service account email |
| `FIREBASE_PRIVATE_KEY` | Service account private key |
| `GMAIL_USER` | Gmail account for notifications |
| `GMAIL_APP_PASSWORD` | Gmail app password (not account password) |
| `MANAGER_EMAILS` | Comma-separated manager emails |

### 5. Store Secrets in Secret Manager

```bash
# Store each secret
echo -n "your-value" | gcloud secrets create SECRET_NAME --data-file=-

# Secrets needed:
# NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
# FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY,
# GMAIL_USER, GMAIL_APP_PASSWORD, MANAGER_EMAILS, ALLOWED_DOMAIN

# Grant Cloud Run access to secrets
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 6. Artifact Registry

```bash
gcloud artifacts repositories create timecard \
  --repository-format=docker \
  --location=us-central1 \
  --description="Lowell Timecard Docker images"
```

### 7. Seed Database

```bash
# Install ts-node if needed
npm install -D ts-node

# Run seed
npx ts-node --project tsconfig.json scripts/seed.ts
```

This creates 2 facilities and a full cannabis taxonomy (5 categories, 12 subcategories, 35+ functions).

### 8. First Deploy

```bash
# Build and push manually for first deploy
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_REGION=us-central1,_REPO=timecard,_SERVICE=lowell-timecard
```

After first deploy, update `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` secrets with the actual Cloud Run URL.

### 9. Set Up Cloud Build Trigger

1. Go to Cloud Build → Triggers → Create Trigger
2. Connect your GitHub repository (`timecard`)
3. Set trigger on push to `main` branch
4. Point to `cloudbuild.yaml`

### 10. QR Code Generation

1. Log in as admin → Dashboard → QR Codes
2. Click **Download QR Code (1024×1024 PNG)** for each facility
3. Print and post at each facility

---

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## User Roles

| Feature | Employee | Manager | Admin |
|---|---|---|---|
| Check in / out | ✅ | ✅ | ✅ |
| View own timecard history | ✅ | ✅ | ✅ |
| View all employee timecards | ❌ | ✅ | ✅ |
| Approve remote check-ins | ❌ | ✅ | ✅ |
| Edit job function taxonomy | ❌ | ✅ | ✅ |
| Edit / correct any timecard | ❌ | ✅ | ✅ |
| Export payroll CSV | ❌ | ✅ | ✅ |
| Manage users & assign roles | ❌ | ❌ | ✅ |
| Generate / download QR codes | ❌ | ❌ | ✅ |
| System settings | ❌ | ❌ | ✅ |

**First login** from the allowed domain is automatically assigned `admin`.

---

## Check-In Flow

1. Employee scans QR code → opens `/scan?facility=FACILITY_ID`
2. If not logged in → Google OAuth → returns to scan page
3. App checks if employee is currently checked in
4. **Not checked in:** Shows check-in screen with facility + time
5. **Already checked in:** Shows check-out flow (function selector + sliders)

### Remote Check-In

- Employee taps "Working Remotely Today" on the check-in screen
- Record created with `status: "pending-approval"`
- Email sent to all manager addresses with an approve link
- Manager approves → status becomes `"checked-in"`

---

## Data Model

```
/users/{userId}         — email, name, role, facilityId, active
/facilities/{id}        — name, location, qrCodeUrl, active
/categories/{id}        — name, order, active
/subcategories/{id}     — name, categoryId, order, active
/functions/{id}         — name, categoryId, subcategoryId, active, order
/timecards/{id}         — employeeId, facilityId, checkInTime, checkOutTime,
                          totalHours, remote, approvedBy, status, allocations[]
```
