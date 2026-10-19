# Symptom Diary — Setup & Run Guide

*Already comfortable with Terminal, env vars, and OAuth? The [technical README](README.md) is a
faster read.*

This project is two apps that work together:

- **A phone app** (for the patient) — sign in with Google, log symptoms each day, see trends,
  and generate a code to share the record with a doctor.
- **A website** (for the clinician) — type in that code to see the patient's record, and
  optionally generate an AI-written consultation summary.

Both talk to the same online database (Supabase), so anything logged in the app shows up on the
website once you unlock it with a code.

**This guide assumes zero technical background.** It will take you roughly **30–45 minutes** the
first time, mostly spent waiting for installers and creating free accounts. After that, running
the project again takes about 10 seconds.

You'll need a **Mac** (the phone app testing steps use Apple's iPhone simulator, which is
Mac-only). If you're on Windows, skip to the [Windows/Android note](#windowsandroid-note) near
the bottom.

---

## Before you start: open Terminal

You'll be pasting a lot of commands into an app called **Terminal**. Don't worry — you're not
"coding", you're just running a program by typing its name, the same as double-clicking an icon.

1. Press `Cmd + Space` to open Spotlight search.
2. Type `Terminal` and press Enter.
3. A window with white or black text opens. That's Terminal. Keep it open for the whole guide.

Handy trick: whenever you need to type a file path, you can type `cd ` (with a trailing space)
and then **drag the folder** from Finder straight into the Terminal window — it fills in the path
for you.

---

## Part 1 — Install the tools

### Node.js (required for both apps)

1. Go to [nodejs.org](https://nodejs.org).
2. Download the **LTS** version (the button that isn't labelled "Current").
3. Open the downloaded file and click through the installer (Continue → Continue → Install),
   same as installing any other Mac app.
4. Back in Terminal, check it worked:

```bash
node -v
```

You should see something like `v20.x.x` or higher. If Terminal says "command not found", restart
Terminal and try again.

### A text editor, for editing two settings files later

You already have one built in — **TextEdit** — so nothing to install. If you'd rather use
something nicer, [VS Code](https://code.visualstudio.com) is free and popular, but not required.

---

## Part 2 — Get the project onto your computer

However you received this folder — AirDrop, a zip file, Google Drive, a USB stick — put it
somewhere easy to find, like your Desktop. Then in Terminal:

```bash
cd ~/Desktop/yochipls
```

(Adjust the path if you put it somewhere else — remember the drag-and-drop trick above.)

Install the shared tooling at the project's top level:

```bash
npm install
```

---

## Part 3 — Create three free accounts

The apps need three outside services to work: a database, Google sign-in, and an AI service for
the consultation summary. All three have generous free tiers — you won't need to pay anything to
try this out.

### 3a. Supabase (the database)

This stores every patient's symptom logs and handles login.

1. Go to [supabase.com](https://supabase.com) and sign up (free).
2. Click **New project**. Give it any name, set a database password (write it down somewhere —
   you probably won't need it again, but just in case), pick any region, and create it. Wait
   about a minute for it to finish setting up.
3. In the left sidebar, click the **SQL Editor** icon, then **New query**.
4. Open the file `supabase/migrations/0001_init.sql` from the project folder (in TextEdit or your
   editor), select all the text, copy it, and paste it into the SQL editor box on the Supabase
   website.
5. Click **Run** (bottom right). You should see a success message. This creates all the tables
   the app needs.
6. Now set up Google sign-in for this project. In the left sidebar: **Authentication →
   Providers**, find **Google** in the list, and click it to expand it. Toggle it **on**. Leave
   this browser tab open — you'll come back to paste in two values from the next step.

### 3b. Google Cloud (Google sign-in)

This lets patients sign into the phone app with their Google account, so the app never has to
handle passwords.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and sign in with any Google
   account.
2. Create a new project (top-left dropdown → **New Project**). Any name is fine.
3. In the search bar at the top, search for **OAuth consent screen** and open it. Choose
   **External**, fill in an app name and your email in the required fields, and save through the
   steps (you can skip optional sections). Under **Test users**, add your own Google email —
   while the app is in testing mode, only listed test users can sign in with it.
4. Search for **Credentials** and open it. Click **+ Create Credentials → OAuth client ID**.
   - Application type: **Web application** (this is the only one you need — the app signs in
     through a browser screen rather than Google's native app-to-app sign-in, so it only ever
     talks to this one client, regardless of whether you're testing on iPhone or Android).
   - Under **Authorized redirect URIs**, go back to your Supabase tab (Authentication →
     Providers → Google) and copy the **Callback URL** shown there. Paste it in as a redirect URI
     here.
   - Click Create. A **Client ID** and **Client Secret** appear — copy both into the Supabase tab
     (the Google provider panel has fields for exactly these) and click **Save** there.

5. Back in your Supabase tab, still on **Authentication → Providers → Google**: scroll down to
   **Redirect URLs** and add this exact entry:

   ```
   symptomdiary://**
   ```

   This is the single most commonly missed step — without it, signing in on the phone app will
   fail with a confusing "can't connect to localhost" error. See
   [Troubleshooting](#troubleshooting) if you hit that.

### 3c. OpenRouter (the AI consultation summary)

This is what turns a patient's logged symptoms into a written summary for the doctor. It's
optional to set up — everything else works without it, you just won't be able to generate a
report.

1. Go to [openrouter.ai](https://openrouter.ai) and sign up.
2. Go to [openrouter.ai/keys](https://openrouter.ai/keys) and create a new key. Copy it somewhere
   safe — you'll only see it once.
3. Add a small amount of credit (openrouter.ai/credits) — a few dollars is enough for a lot of
   testing. The report feature won't work with $0 balance.

---

## Part 4 — Fill in the two settings files

Each app has a small file listing the "keys" from Part 3, so it knows how to reach your Supabase
project. Neither file gets shared or uploaded anywhere — they stay on your computer.

### Website settings

```bash
cp web/.env.example web/.env.local
```

Open `web/.env.local` in TextEdit and fill in the values on the right of the `=` signs:

```
NEXT_PUBLIC_SUPABASE_URL       → Supabase: Project Settings (gear icon) → API section → "Project URL"
SUPABASE_SERVICE_ROLE_KEY      → same page → "service_role" key
SESSION_JWT_SECRET             → any random string, 32+ characters — see command below
OPENROUTER_API_KEY             → the key you copied in step 3c
```

For `SESSION_JWT_SECRET`, generate a random value with:

```bash
openssl rand -base64 48
```

Copy the output and paste it in as the value.

### Phone app settings

```bash
cp mobile/.env.example mobile/.env
```

Open `mobile/.env` and fill in:

```
EXPO_PUBLIC_SUPABASE_URL       → the same Project URL as above
EXPO_PUBLIC_SUPABASE_ANON_KEY  → same Supabase API page → "anon" / "publishable" key (NOT the service role one — that name is easy to mix up, so double check)
```

---

## Part 5 — Run the phone app

Install its dependencies (only needed the first time):

```bash
cd mobile && npm install
```

The phone app needs Apple's **Xcode** to run in the iPhone Simulator — this is a big download
(10–15 GB) and the slowest part of this whole guide. Grab a coffee.

1. Open the **App Store** app, search for **Xcode**, and install it. This can take a while.
2. Once installed, open Terminal and accept its license (you'll be asked for your Mac password —
   that's normal, it's not saving or sending it anywhere):

   ```bash
   sudo xcodebuild -license
   ```

   A wall of text appears — press the space bar repeatedly to scroll to the bottom, then type
   `agree` and press Enter.

Now build and run the app:

```bash
cd mobile && npx expo run:ios
```

The first run takes several minutes (it's compiling the app). A simulated iPhone screen should
pop up automatically with the app running on it. After this first time, the same command is much
faster.

**Try it:** tap Continue with Google, sign in, and log a day's symptoms. On the last screen
(Share tab), you'll see an 8-character code that changes every minute — that's what unlocks your
data on the website.

---

## Part 6 — Run the website

In a **new** Terminal tab or window (`Cmd + T`), so the phone app keeps running:

```bash
cd web && npm install
```

```bash
cd web && npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Type in the 8-character code
currently showing in the phone app's Share tab, and you should see the patient's record.

From there, the **Consultation report** button generates the AI summary (needs Part 3c set up).

---

## Troubleshooting

**"Safari can't open the page because it couldn't connect to the server" (shows "localhost")
right after Google sign-in on the phone app.**
You missed the redirect URL step in 3b — go to Supabase → Authentication → Providers → Google →
Redirect URLs, and make sure `symptomdiary://**` is listed exactly. No app rebuild needed, just
retry signing in after saving.

**"xcrun simctl help exited with non-zero code: 69" / "xcrun is not configured correctly."**
You haven't accepted the Xcode license yet — run `sudo xcodebuild -license` (see Part 5) and
retry.

**"ExpoSecureStore.default.getValueWithKeyAsync is not a function."**
You're running the app through the plain **Expo Go** app instead of the proper build. This
project needs `npx expo run:ios` (Part 5), not `npx expo start` + scanning a QR code — Google
sign-in and the secure code storage don't work in Expo Go.

**The website says the code isn't valid.**
The code refreshes every 60 seconds — make sure you're typing the one currently showing, not one
you copied a minute ago.

**Nothing happens / a command says "command not found".**
Close Terminal completely and reopen it (Part 1's Node install needs a fresh Terminal window to
be recognised the first time).

---

## Windows/Android note

Everything in Part 6 (the website) works fine on Windows — Node.js and Next.js aren't Mac-only.

For the phone app on Windows, replace `npx expo run:ios` with `npx expo run:android`, which needs
[Android Studio](https://developer.android.com/studio) installed instead of Xcode (also a large
download, with its own emulator setup wizard the first time you open it). Part 3b's Google Cloud
setup is the same either way — it's a single web-based OAuth client, not tied to a platform.

---

## Running the automated checks (optional)

If you want to confirm nothing broke after making a change, from the project's top level:

```bash
npm test
```

This checks the database rules and the security code — no app needs to be running for this.

To test the AI report writer on its own, without going through the whole sign-in → log → share
flow:

```bash
cd web && npm run test:report
```

---

## For anyone writing up the technical side

A few decisions worth knowing if you're documenting this project or explaining it to a mentor:

- **The "how bad is it" score is calculated once, in the database** — not separately in the app
  and the website. That way the two can never disagree about whether a patient's symptoms count
  as "elevated" that day.
- **Skipping a question is recorded as "no answer", not as a zero.** "This didn't apply to me
  today" and "it applied and it didn't hurt" are different facts, and conflating them would
  quietly understate how much pain someone is actually in.
- **The sharing code works like Google Authenticator** — a new 8-character code every 60 seconds,
  generated on the phone with no internet connection needed, rather than a single code that stays
  valid forever.
- **The AI report is given calculated statistics, not raw diary entries**, so every number in the
  summary can be checked against the real data, and the cost doesn't grow the longer someone has
  been using the app. The model itself is swappable via one setting (`OPENROUTER_MODEL`) with no
  code changes.
- **The database has no official medical-privacy certification (HIPAA/PDPA) on the free tier.**
  Fine for a school project demo; would need addressing before this touched real patient data.
- **The app doesn't currently track menstrual cycle dates.** Without that, the AI summary can't
  tell the difference between pain that comes and goes with a cycle versus pain that's constant —
  worth mentioning as a known limitation in a write-up.
