# WATZHMe Lite v1.0.0 — Google Play Store Submission Guide

> **Last updated**: February 11, 2026
> **Status**: Phase C — Production build ready

---

## Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [Project Configuration Files](#2-project-configuration-files)
3. [Step-by-Step Build Commands](#3-step-by-step-build-commands)
4. [Production Testing Checklist](#4-production-testing-checklist)
5. [Installing .aab Locally for Testing](#5-installing-aab-locally-for-testing)
6. [Play Console Upload & Internal Testing](#6-play-console-upload--internal-testing)
7. [Store Listing Content](#7-store-listing-content)
8. [Data Safety Declaration](#8-data-safety-declaration)
9. [Content Rating](#9-content-rating)
10. [Release Strategy](#10-release-strategy)
11. [Common Rejection Avoidance](#11-common-rejection-avoidance)
12. [Post-Launch Monitoring](#12-post-launch-monitoring)

---

## 1. Prerequisites

### Required Accounts
| Account | Cost | URL |
|---------|------|-----|
| Google Play Developer | $25 one-time | https://play.google.com/console |
| Expo Account | Free | https://expo.dev |

### Required Tools
```bash
# Node.js 18+ required
node --version

# Install EAS CLI globally
npm install -g eas-cli

# Verify installation
eas --version   # Should be >= 5.0.0
```

### Required Assets (before build)
| Asset | Size | Format | Notes |
|-------|------|--------|-------|
| App icon | 512×512 | PNG, no transparency | Black bg, white "W" with emerald gradient |
| Adaptive icon foreground | 432×432 | PNG with transparency | Centered logo, safe zone aware |
| Splash screen | 1284×2778 | PNG | Dark bg, centered logo |
| Feature graphic | 1024×500 | PNG | For Play Store listing |
| Screenshots | 1080×1920+ | PNG/JPEG | Minimum 4, recommended 8 |

Place assets in:
```
assets/
├── icon.png              (512×512)
├── adaptive-icon.png     (432×432)
└── splash.png            (1284×2778)
```

---

## 2. Project Configuration Files

### eas.json (already created in project root)
```json
{
  "cli": {
    "version": ">= 5.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "apk",
        "gradleCommand": ":app:assembleDebug"
      },
      "env": {
        "APP_ENV": "development"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk",
        "gradleCommand": ":app:assembleRelease"
      },
      "env": {
        "APP_ENV": "preview"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle",
        "gradleCommand": ":app:bundleRelease"
      },
      "releaseChannel": "production",
      "distribution": "store",
      "autoIncrement": true,
      "env": {
        "APP_ENV": "production"
      }
    }
  },
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./google-service-account.json",
        "track": "internal",
        "releaseStatus": "draft"
      }
    }
  }
}
```

### app.json (already created in project root)
```json
{
  "expo": {
    "name": "WATZHMe Lite",
    "slug": "watzhme-lite",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "dark",
    "scheme": "watzhme",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#000000"
    },
    "assetBundlePatterns": ["**/*"],
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#000000"
      },
      "package": "com.watzhme.lite",
      "versionCode": 1,
      "targetSdkVersion": 35,
      "permissions": [
        "CAMERA",
        "READ_MEDIA_IMAGES",
        "READ_MEDIA_VIDEO",
        "INTERNET",
        "ACCESS_NETWORK_STATE",
        "RECORD_AUDIO"
      ],
      "blockedPermissions": [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "READ_CONTACTS",
        "READ_PHONE_STATE",
        "READ_CALL_LOG",
        "READ_SMS",
        "SEND_SMS",
        "RECEIVE_SMS"
      ]
    },
    "plugins": [
      "expo-router",
      ["expo-image-picker", {
        "photosPermission": "WATZHMe needs access to your photos to share them",
        "cameraPermission": "WATZHMe needs camera access to take photos and videos"
      }],
      ["expo-media-library", {
        "photosPermission": "WATZHMe needs access to your media library",
        "savePhotosPermission": "WATZHMe needs permission to save media"
      }]
    ],
    "extra": {
      "eas": {
        "projectId": "YOUR_EAS_PROJECT_ID_HERE"
      }
    },
    "updates": {
      "url": "https://u.expo.dev/YOUR_EAS_PROJECT_ID_HERE"
    },
    "runtimeVersion": {
      "policy": "appVersion"
    }
  }
}
```

> **Important**: Replace `YOUR_EAS_PROJECT_ID_HERE` with your actual project ID after running `eas init`.

---

## 3. Step-by-Step Build Commands

### First-Time Setup (run once)

```bash
# Step 1: Install EAS CLI if not already installed
npm install -g eas-cli

# Step 2: Log in to your Expo account
eas login
# Enter your Expo username and password when prompted

# Step 3: Verify you're logged in
eas whoami
# Should display your Expo username

# Step 4: Initialize EAS in the project (generates projectId)
eas init
# This will create/update the projectId in app.json → extra.eas.projectId

# Step 5: Configure build settings
eas build:configure --platform android
# Confirms eas.json is valid and project is linked

# Step 6: Set environment secrets (keeps keys out of source code)
eas secret:create --scope project --name SUPABASE_URL --value "https://YOUR-PROJECT-ID.supabase.co"
eas secret:create --scope project --name SUPABASE_ANON_KEY --value "your-actual-anon-key-here"
```

> **IMPORTANT**: Also create a local `.env` file for development:
> ```bash
> cp .env.example .env
> # Edit .env and fill in your real Supabase URL and anon key
> ```


### Build for Testing (APK — sideload on device)

```bash
# Build a preview APK for internal testing
eas build --platform android --profile preview

# Wait for build to complete (typically 10-20 minutes)
# Download URL will be printed in terminal when done
# Also available at: https://expo.dev → Your Project → Builds
```

### Build for Production (AAB — Play Store)

```bash
# Build the production Android App Bundle
eas build --platform android --profile production

# This will:
#   1. Bundle all JavaScript code
#   2. Build the native Android project
#   3. Sign with your upload keystore (auto-generated on first build)
#   4. Produce a .aab file
#   5. Upload to EAS servers
#   6. Print download URL when complete

# Build typically takes 15-25 minutes
```

### After Build Completes

```bash
# Option A: Download .aab from terminal output URL
# The terminal will show something like:
#   Build complete: https://expo.dev/artifacts/eas/abc123.aab

# Option B: Download from Expo dashboard
# Go to: https://expo.dev → Your Project → Builds → Latest → Download
```

### Auto-Submit to Play Store (optional)

```bash
# Requires google-service-account.json in project root
# See: https://docs.expo.dev/submit/android/

eas submit --platform android --profile production
# Uploads the latest .aab directly to Play Console internal testing track
```

---

## 4. Production Testing Checklist

After building the .aab (or preview .apk), install on a real Android device and verify every item:

### Core Authentication
- [ ] Launch app → splash screen shows for ~1.5s → feed loads
- [ ] Feed is browsable WITHOUT logging in (public access)
- [ ] Tap Profile → prompted to log in
- [ ] Register new account → success → redirected to feed
- [ ] Log out → log back in with same credentials
- [ ] Forgot password flow sends email

### Content Upload
- [ ] Upload image → compresses → uploads → appears in feed within 5s
- [ ] Upload short video → thumbnail generated → uploads → plays in feed
- [ ] Upload on slow connection (mobile data) → still completes (may be slower)
- [ ] Caption and hashtags save correctly

### Feed & Discovery
- [ ] Scroll feed → posts load continuously (infinite scroll)
- [ ] View counts increment on scroll
- [ ] Videos auto-play when visible, pause when scrolled away
- [ ] Double-tap to like → heart animation → like count updates
- [ ] Search screen → search by username → results appear
- [ ] Search screen → search by caption/hashtag → results appear

### Comments (Phase B fix verified)
- [ ] Open comments on any post → existing comments load
- [ ] Type comment → press Send → comment appears immediately (optimistic)
- [ ] Comment persists after closing and reopening comments sheet
- [ ] Realtime: another user's comment appears without refresh
- [ ] Empty comment → Send button disabled / does nothing

### Direct Messages (Phase B fix verified)
- [ ] Open Inbox → conversation list loads
- [ ] Open a chat → message history loads
- [ ] Type message → Send icon appears (emerald/cyan colored)
- [ ] Empty input → Send icon hidden or greyed out (opacity 0.4)
- [ ] Press Send → message appears in chat immediately (optimistic)
- [ ] Message shows single grey tick → updates to double tick on delivery
- [ ] Input clears after sending
- [ ] Keyboard dismisses after send

### Profile & Social
- [ ] Own profile shows correct post count, followers, following
- [ ] Follow a user → follower/following counts update instantly (+1)
- [ ] Unfollow → counts update instantly (-1)
- [ ] Tap followers count → opens followers list
- [ ] Tap following count → opens following list
- [ ] View another user's profile → Follow/Unfollow button works

### Settings (Phase B fix verified)
- [ ] Tap gear/cog icon on own profile → Settings screen opens
- [ ] "Edit Profile" button/link present and navigates correctly
- [ ] "Privacy Policy" link opens privacy policy
- [ ] "Terms of Service" link opens terms
- [ ] "Logout" button → logs out → returns to feed
- [ ] Back button returns to profile

### Post Management (Phase C feature)
- [ ] Own profile → three-dot menu on own posts → visible on hover/tap
- [ ] Tap delete → confirmation dialog appears
- [ ] Confirm delete → post removed from grid immediately
- [ ] Post no longer appears in feed after refresh
- [ ] Cannot delete other users' posts (no three-dot menu shown)

### Production Quality
- [ ] No Expo debug menu appears (shake device → nothing happens)
- [ ] No yellow warning boxes
- [ ] No console error overlays
- [ ] App doesn't crash on any screen transition
- [ ] App recovers gracefully from network loss (offline indicator shows)
- [ ] Memory usage stays reasonable after 5+ minutes of scrolling
- [ ] App resumes correctly after being backgrounded

### Performance
- [ ] Feed scrolls at 60fps (no jank)
- [ ] Screen transitions are smooth (<300ms)
- [ ] Image loading shows placeholder → loads progressively
- [ ] App cold start < 3 seconds on mid-range device

---

## 5. Installing .aab Locally for Testing

Android App Bundles (.aab) cannot be installed directly on a device. You have three options:

### Option A: Use bundletool (Recommended for local testing)

```bash
# Step 1: Download bundletool
# https://github.com/google/bundletool/releases
# Download bundletool-all-X.X.X.jar

# Step 2: Generate APKs from the .aab
java -jar bundletool-all-1.17.1.jar build-apks \
  --bundle=watzhme-lite.aab \
  --output=watzhme-lite.apks \
  --mode=universal

# Step 3: Install on connected device
java -jar bundletool-all-1.17.1.jar install-apks \
  --apks=watzhme-lite.apks

# Or extract the universal APK and install manually:
unzip watzhme-lite.apks -d extracted/
adb install extracted/universal.apk
```

### Option B: Use the Preview APK profile instead

```bash
# Build a directly-installable APK for testing
eas build --platform android --profile preview

# Download the .apk from the build URL
# Transfer to device and install, or:
adb install watzhme-lite-preview.apk
```

### Option C: Upload to Play Console Internal Testing

```bash
# Upload .aab to Play Console → Internal testing track
# Add your device's Google account as a tester
# Install via the Play Store internal test link
# This is the most accurate test (uses Play Store delivery)
```

> **Recommendation**: Use **Option B** (preview APK) for quick device testing, then **Option C** (internal testing track) for final validation before public release.

---

## 6. Play Console Upload & Internal Testing

### Step 1: Create App in Play Console

1. Go to https://play.google.com/console
2. Click **"Create app"**
3. Fill in:
   - **App name**: WATZHMe Lite
   - **Default language**: English (United States)
   - **App or game**: App
   - **Free or paid**: Free
4. Check all declaration boxes
5. Click **"Create app"**

### Step 2: Complete App Setup

In the left sidebar, complete all required sections:

1. **App access** → "All functionality is available without special access"
   - (Feed is publicly browsable without login)

2. **Ads** → "No, my app does not contain ads"

3. **Content rating** → Complete IARC questionnaire (see Section 9)

4. **Target audience** → Select age groups (NOT under 13)

5. **News app** → "No"

6. **Data safety** → Complete form (see Section 8)

7. **Government apps** → "No"

### Step 3: Create Internal Testing Release

1. Go to **Testing → Internal testing**
2. Click **"Create new release"**
3. **App signing**: Let Google manage your signing key (recommended)
4. Upload your `.aab` file
5. Add **Release name**: `1.0.0 (1)` 
6. Add **Release notes**:
   ```
   WATZHMe Lite v1.0.0 — Initial release
   - Share photos and short videos
   - Vertical feed with auto-play
   - Real-time comments and direct messages
   - Follow users, like and bookmark posts
   - Search and discover content
   - Privacy-first design (POPIA compliant)
   ```
7. Click **"Review release"** → **"Start rollout to Internal testing"**

### Step 4: Add Testers

1. Go to **Internal testing → Testers**
2. Create a new email list or use existing
3. Add tester email addresses (up to 100)
4. Share the **opt-in link** with testers
5. Testers open the link → accept → install from Play Store

### Step 5: Verify Installation

- Testers install from Play Store internal test link
- Run through the full [Production Testing Checklist](#4-production-testing-checklist)
- Fix any issues → increment versionCode → rebuild → upload new .aab
- Repeat until all tests pass

---

## 7. Store Listing Content

### Main Store Listing

**App name**: WATZHMe Lite

**Short description** (80 chars max):
```
Share every moment. Fast, lite video & photo sharing from South Africa.
```

**Full description** (4000 chars max):
```
WATZHMe Lite — Share Every Moment

The fastest, lightest way to share photos and videos with the world. Built in Kimberley, South Africa, WATZHMe Lite brings you a TikTok-style vertical feed experience without the bloat.

KEY FEATURES:

Share Photos & Videos
Upload and share your best moments with the world. Images are automatically compressed for fast uploads. Video thumbnails are generated automatically.

Vertical Feed
Scroll through an endless feed of content from creators around the world. Swipe up to discover new posts. Double-tap to like.

Real-Time Comments
Comment on posts and see replies appear instantly. Our real-time system means you never miss a conversation.

Direct Messages
Chat privately with other users. Real-time messaging with read receipts keeps conversations flowing.

Discover & Search
Find new creators and trending content. Search by username or caption. Explore trending tags.

Customizable Profiles
Set your avatar, bio, and full name. View your posts, liked content, and saved bookmarks.

Privacy First
Built with POPIA (South African data protection law) compliance. Your data is encrypted, never sold, and you can delete it anytime.

LITE & FAST:
- Small app size
- Optimized for all Android devices
- Works on slower connections
- No ads, no tracking

MADE IN SOUTH AFRICA
WATZHMe is proudly built in Kimberley, Northern Cape. We believe everyone deserves a platform to share their story.

Contact: watzhme@gmail.com
Privacy Policy: Available in-app
```

### Graphics Checklist
- [ ] App icon uploaded (512×512 PNG)
- [ ] Feature graphic uploaded (1024×500 PNG)
- [ ] Phone screenshots uploaded (minimum 4, up to 8):
  1. Feed screen (vertical scroll with content)
  2. Discover/Search screen
  3. Upload screen
  4. Profile screen
  5. Comments section
  6. Chat/Messages
  7. Settings screen
  8. Privacy Policy

### Categorization
- **Category**: Social
- **Tags**: social, video sharing, photo sharing, short videos, messaging

---

## 8. Data Safety Declaration

In Play Console → **Policy → App content → Data safety**

### Overview Questions

| Question | Answer |
|----------|--------|
| Does your app collect or share user data? | Yes |
| Is all user data encrypted in transit? | Yes (HTTPS/TLS) |
| Can users request data deletion? | Yes (email: watzhme@gmail.com) |

### Data Types Collected

| Data Type | Collected | Shared | Purpose | Required |
|-----------|-----------|--------|---------|----------|
| Email address | Yes | No | Account management | Yes |
| User IDs | Yes | No | Account management | Yes |
| Name | Yes | No | App functionality | No (optional) |
| Profile photo | Yes | No | App functionality | No (optional) |
| Photos/Videos | Yes | No | App functionality | No |
| Messages | Yes | No | App functionality | No |
| Other UGC (comments, captions) | Yes | No | App functionality | No |
| Crash logs | Yes | No | Analytics/debugging | Auto |
| App interactions | Yes | No | Analytics | Auto |

### Data Deletion
> "Users can request account and data deletion by emailing watzhme@gmail.com. Requests are processed within 30 days per POPIA requirements. Users can also delete individual posts from within the app."

---

## 9. Content Rating

### IARC Questionnaire Answers

| Question | Answer |
|----------|--------|
| Violence | No |
| Sexuality | No (UGC may vary) |
| Language | Not controlled |
| Controlled substances | No |
| User interaction | Yes |
| Users can communicate | Yes |
| Location sharing | No |
| User-generated content | Yes |
| In-app purchases | No |

**Expected rating**: **Teen** (due to user-generated content and social features)

---

## 10. Release Strategy

### Recommended Rollout

| Phase | Track | Testers | Duration | Goal |
|-------|-------|---------|----------|------|
| 1 | Internal testing | Up to 100 (your team) | 1 week | Core functionality verification |
| 2 | Closed testing | Up to 1,000 (invite-only) | 1-2 weeks | Broader feedback, edge cases |
| 3 | Open testing | Unlimited (public opt-in) | 1-2 weeks | Scale testing, crash monitoring |
| 4 | Production | Staged rollout (10% → 50% → 100%) | 1 week | Gradual public release |

### Version Management
```bash
# For each new release:
# 1. Update version in app.json (e.g., "1.0.1")
# 2. versionCode auto-increments via EAS (autoIncrement: true)
# 3. Build and upload

eas build --platform android --profile production
# versionCode will automatically be 2, 3, 4, etc.
```

---

## 11. Common Rejection Avoidance

### Top Rejection Reasons & Mitigations

| Rejection Reason | Our Mitigation | Status |
|-----------------|----------------|--------|
| Missing Privacy Policy | Full policy in-app + URL in listing | Done |
| Inaccurate Data Safety | Declarations match actual collection | Done |
| Missing Consent Disclosures | POPIA checkbox on registration | Done |
| Broken Functionality | All features tested (Phase B fixes) | Done |
| Impersonation | Original branding, no false claims | Done |
| No Content Moderation | Post delete, report via email, ToS | Done |
| Excessive Permissions | Only camera/media/internet, blocked location/contacts | Done |
| Wrong Target API | targetSdkVersion: 35 (Android 15) | Done |

### Pre-Submission Final Checklist
- [ ] App icon meets guidelines (512×512, no transparency, no text)
- [ ] Feature graphic uploaded (1024×500)
- [ ] At least 4 phone screenshots
- [ ] Privacy policy URL in store listing
- [ ] Data safety form completed and accurate
- [ ] Content rating questionnaire completed
- [ ] App access instructions provided
- [ ] Contact email set: watzhme@gmail.com
- [ ] Target audience: NOT "children" (no under-13)
- [ ] Ads declaration: No ads
- [ ] App category: Social
- [ ] All testing checklist items pass

---

## 12. Post-Launch Monitoring

### Daily Checks (first 2 weeks)
- [ ] Play Console → Android Vitals → Crash rate < 1.09%
- [ ] Play Console → Android Vitals → ANR rate < 0.47%
- [ ] Respond to user reviews within 24 hours
- [ ] Monitor Supabase dashboard for unusual activity

### Key Metrics to Track

| Metric | Target | Where to Check |
|--------|--------|----------------|
| Crash-free rate | > 99.5% | Play Console → Vitals |
| ANR rate | < 0.47% | Play Console → Vitals |
| Day 1 retention | > 40% | Play Console → Statistics |
| Day 7 retention | > 20% | Play Console → Statistics |
| Average rating | > 4.0 | Play Console → Ratings |
| Install/uninstall ratio | > 70% kept | Play Console → Statistics |

### Update Cadence
- Critical bugs: hotfix within 24-48 hours
- Regular updates: every 2-4 weeks
- Always increment versionCode
- Use OTA updates for JS-only changes:
  ```bash
  eas update --branch production --message "Bug fix: description"
  ```

---

## Quick Commands Reference

```bash
# === Development ===
npx expo start --dev-client          # Start dev server

# === Building ===
eas build --platform android --profile preview      # Test APK
eas build --platform android --profile production   # Store AAB
eas build:list                                       # List all builds
eas build:view                                       # View latest build

# === Submitting ===
eas submit --platform android                        # Submit to Play Store

# === OTA Updates (JS-only changes) ===
eas update --branch production --message "v1.0.1 fixes"

# === Secrets ===
eas secret:list                                      # List project secrets
eas secret:create --scope project --name KEY --value "val"
```

---

## Support

| Resource | URL |
|----------|-----|
| Expo Docs | https://docs.expo.dev |
| EAS Build Guide | https://docs.expo.dev/build/introduction/ |
| EAS Submit Guide | https://docs.expo.dev/submit/android/ |
| Play Console Help | https://support.google.com/googleplay/android-developer/ |
| WATZHMe Support | watzhme@gmail.com |

---

*WATZHMe Lite v1.0.0 | Kimberley, Northern Cape, South Africa*
*Copyright 2026 WATZHMe. All rights reserved.*
