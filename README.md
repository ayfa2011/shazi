# Our Little World — Couple Website

A mobile-first private couple website with English UI, Firebase Authentication, Cloud Firestore, Realtime Database features, memories, bucket list, questions, challenges, letters, mini games, collaborative drawing, and shared music.

## Current Firebase setup
- Firebase project: `our-little-world-e9cbb`.
- Web app configuration is in `firebase/firebase-config.js`.
- Email/Password sign-in is enabled.
- Firebase Authentication has one account for each partner. The login screen lets each person choose their name and enter the password for that Firebase account.
- Cloud Firestore is created in `nam5` (United States multi-region). Its rules allow only the two configured partner accounts to access `couples/our-little-world/**`.
- `firebase/firestore.indexes.json` defines the composite index used by typed item lists. Deploy the index and current Firestore rules from the project root with `firebase deploy --only firestore:indexes,firestore:rules` after selecting the Firebase project; wait for the index to finish building before testing lists.
- Realtime Database is ready at `https://our-little-world-e9cbb-default-rtdb.firebaseio.com/` in `us-central1`. Its rules allow only the two configured partner accounts.
- The Dashboard includes a shared days-together counter and Shazy/Kabir diary walls. Posts, likes, comments, replies, and short voice replies are saved in Cloud Firestore.
- The Dashboard uses one shared couple feed for text and photo posts. Each person can edit or delete their own posts; both can like, comment, and reply.
- The floating pencil or dashboard drawing preview opens the full-screen live canvas with a custom color picker, brush size, eraser, undo, clear, online presence, and a History overlay ordered newest-first. The dashboard preview shows the last shared drawing. Drawings are compressed and saved in Firestore, so both partners can view them without separate Google Drive permissions.
- Diary posts, memories, drawings, and profile photos use compressed inline image data in Firestore; Firebase Storage and Google Drive access are not required for these features.
- The More > Profile screen shows only the signed-in partner's profile, and Firestore rules limit profile edits to that account. Display names and bios update across shared content. Profile photos are compressed before saving; the initial profiles use sample portrait photos and bios that can be replaced.
- Firestore rules restrict diary post edits and deletes to their author. New scheduled letter bodies are stored separately; only the author can read them before delivery, and the intended recipient gains access after delivery. Legacy scheduled letters are moved to protected storage when either partner next opens Letters.
- Today's Question seeds an original 105-question bank across seven categories into Firestore on first use, selects a stable daily question, and stores question history. Each partner's answer is in a separate protected document; Firestore rules allow reading the partner's answer only after both partners have submitted. The first time each partner opens Question History, their own legacy answers are migrated from the old shared feed into their private answer documents. Publish the updated `firebase/firestore.rules` for the answer privacy guarantee to apply in Firebase.
- Dashboard's Daily Challenge card opens the Challenges page with Today, This Week, and Completed tabs. Challenges move through Upcoming, In Progress, Completed, or Skipped; completion can include a note and compressed photo, plus completion name and time. Existing completed challenge history remains visible.
- Challenge acceptance, skipping, and completion are tracked per partner. The shared challenge is marked completed or skipped only after both partners have made that choice; each partner's completion note and photo are retained.
- The app includes a service worker and install icons for installation on supported browsers. Serve it over HTTPS (GitHub Pages qualifies); Firebase-backed features still require an internet connection.
- This source currently contains the account emails used by Firebase client-side rules and profile matching. Those emails are not secrets in Firebase's security model, but they are personal information: keep the repository private or migrate the authorization checks to Firebase Authentication UIDs before making the repository public. Making the repository private does not remove data already present in Git history or deployed hosting.

## Rules files
`firebase/firestore.rules`, `firebase/database.rules.json`, and `firebase/storage.rules` are local source files. The updated Firestore profile-edit restriction is local and must be published to Firebase to take effect. The Storage rules are not published because Firebase Storage is not yet set up for this project.
