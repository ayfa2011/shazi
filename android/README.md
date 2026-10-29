# Our Little World — Android Native App Plan

This directory is a separate Android app workspace. The existing website remains the production app and is not changed by this app. Work on the Android app can be stopped at any milestone without affecting the website or its Firebase data.

## Recommendation

Build a native Android app in Kotlin with Jetpack Compose and the Firebase Android SDK. Keep the current Firebase project and website in place. Register a separate Android app in the existing Firebase project when implementation begins; this adds an app client but does not replace the web client. Do not create or deploy Firestore/Realtime Database rules as part of the first prototype.

The native app will share Firebase Auth accounts and cloud data with the website, subject to confirming Android SDK compatibility with the existing rules and document shapes. Use Firestore's Android offline persistence for supported Firestore reads/writes. Realtime Database has a separate disk-persistence setting and needs explicit testing. Telegram media currently flows through an authenticated Cloudflare Worker; retain that boundary and never put a Telegram bot token in the APK.

## Existing product map

The website is a mobile-first JavaScript PWA, not a conventional server-rendered site. It already has install metadata, a service worker, Firestore IndexedDB persistence, and a bounded IndexedDB cache for media previously loaded through the Telegram proxy.

| Area | Existing implementation / service | Native-app scope |
|---|---|---|
| Sign-in and profiles | Firebase Email/Password Auth; two profile choices; session-only browser persistence | Native sign-in, profile selection, and explicit session behavior. Decide whether Android should remember login between launches. |
| Home and shared posts | Firestore dashboard, posts, comments, likes, voice notes and profile metadata | Native feed, pagination, cached text and image previews. |
| Memories, letters, questions | Firestore records; some protected/scheduled letter data and question-answer privacy | Separate screens and repository methods; preserve current access boundaries. |
| Games and challenges | Firestore plus Realtime Database for live matches/presence; Cloud Function validates Battleship actions | Phase these after the core app. Real-time reconnection and multiplayer rules need device testing. |
| Drawing and chat | Realtime Database live state; local drawing outbox; Firestore history | Native canvas/chat are substantial custom UI work; retain queued writes and reconnect behavior. |
| Photos, video, audio | Telegram media via authenticated Cloudflare Worker; Firestore stores references, not bytes | Implement authenticated upload/download, Android media permissions/pickers, bounded disk cache, and playback. |
| Music and notifications | RTDB playback coordination; in-app/browser notifications; no true closed-app push sender | Native playback/background lifecycle and FCM push are separate scope; push requires sender/platform setup. |
| Special days, bucket list, profile | Firestore | Native CRUD screens and validation. |

Firebase project ID is `our-little-world-e9cbb`; couple document namespace is `our-little-world`. Web app config is in `firebase/firebase-config.js`. Android setup needs a new registered Android package and `google-services.json`. Choose the permanent package ID before Firebase registration and signing-key setup.

## Current native structure

```text
android/
  app/                    # Kotlin + Jetpack Compose prototype shell
  README.md               # This plan and milestone record
  settings.gradle.kts
  build.gradle.kts
```

Use a small layered architecture: Compose screens and navigation; view models for screen state; repositories for Auth, Firestore, RTDB, and Worker media calls. Keep Firebase rules and backend deployment out of the Android build. Never commit signing credentials or service-account secrets.

## Parity-first implementation milestones

1. **Foundation (complete):** confirmed package ID `com.ourlittleworld.couple`; registered an Android client in the existing Firebase project; added Compose, icon, splash screen, and Gradle wrapper.
2. **Home parity:** finish relationship-date edit/save, dashboard reminders, partner-post like/comment actions, live drawing preview, daily-question/challenge state, profile/presence/notification/music controls, and working native navigation.
3. **Content parity:** implement Posts, Gallery, Memories, Letters, Questions, Bucket List, Profile, Activities, and Special Days with matching Firebase paths, validation, privacy, media, and interactions.
4. **Realtime parity:** implement all games, Challenges, Drawing Canvas, partner chat, Music, and notification behavior against the existing RTDB, Firestore, Cloud Function, and Worker contracts.
5. **Offline and security parity:** verify Firestore/RTDB persistence, Telegram media cache and auth, drawing outbox, reconnection, both partner accounts, and existing Firestore/RTDB rules.
6. **Parity review:** complete every item in [PARITY.md](PARITY.md) using the website as the source of truth. **Do not create another APK until all required items pass review.**
7. **APK build and private release:** only after parity review, produce a new APK and prepare a stable signed update/distribution path.

At every point, the website remains usable. Android changes stay in this directory. Do not change deployed rules, Cloud Functions, the Worker, or website code to make the native client fit; document and review any backend incompatibility separately.

## Key trade-offs and risks

- **Native feel vs. scope:** Compose can provide native navigation, scrolling, splash, and platform integration. Rebuilding the feature-rich site is a meaningful project; the APK alone does not make a WebView native.
- **Offline behavior:** Firestore Android disk cache is suitable for previously fetched Firestore documents, but it does not cache Telegram media automatically. Define cache size/eviction and decide how stale data is presented. RTDB persistence and live presence need separate tests.
- **Shared Firebase rules:** current rules authorize two accounts by email and constrain certain fields. Verify all native writes against the deployed rules; do not weaken rules to make a prototype work. Longer term, Firebase Auth UIDs are more robust identifiers than email checks.
- **Telegram Worker:** the Android client must send a Firebase ID token using the Worker’s supported protocol. Confirm CORS is not the only authentication control and verify the Worker accepts Android requests before media work starts.
- **Account persistence:** the website deliberately uses session-only auth. Android's normal persistence behavior may differ; choose and document the desired sign-out/session behavior before implementation.
- **Private APK updates:** direct install is practical for a few users, but updates require a trusted download path, the same signing identity, and clear installation steps. Users may need to allow installs from that source.
- **No absolute zero-lag guarantee:** performance depends on device, network, media size, Firebase round trips, and implementation. Set measurable prototype targets rather than promising zero lag.

## Current status

- The native Kotlin/Compose app currently includes the website icon, splash screen, Firebase Email/Password sign-in, and a partial Home screen. Other website routes and behaviors are not yet implemented.
- The confirmed package ID is `com.ourlittleworld.couple`.
- Firebase CLI registration added Android app ID `1:343413324901:android:217d2cae6ef21a32df5a8c` to project `our-little-world-e9cbb`; its `google-services.json` is in `app/`.
- The APK currently in `app/build/outputs/apk/debug/app-debug.apk` is an interim prototype. **Do not rebuild or distribute a replacement APK until every required item in `PARITY.md` is complete.**
- The installed SDK platform is API 37; project compile/target SDK are set to 37.
- The website reference is the current implementation in the root project; `PARITY.md` records its routes, behaviors, shared services, and completion checks.
- The only existing workspace change detected before this plan was `.firebase/hosting..cache` (already modified).
- No website source, Firebase rules, hosting, or cloud data was changed. The only Firebase-side change is registration of the new Android client listed above.
