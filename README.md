# Our Little World — Couple Website

A mobile-first private couple website with English UI, Firebase Authentication, Cloud Firestore, Realtime Database features, memories, bucket list, questions, challenges, letters, mini games, collaborative drawing, and shared music.

## Current Firebase setup
- Firebase project: `our-little-world-e9cbb`.
- Web app configuration is in `firebase/firebase-config.js`.
- Email/Password sign-in is enabled.
- Firebase Authentication has users for Kebyy (`akabeeram@gmail.com`) and Shazy (`hizasgallery@gmail.com`). The login screen lets each person choose their name and enter the password for that Firebase account.
- Cloud Firestore is created in `nam5` (United States multi-region). Its rules allow only those two emails to access `couples/our-little-world/**`.
- Realtime Database is ready at `https://our-little-world-e9cbb-default-rtdb.firebaseio.com/` in `us-central1`. Its rules allow only the two account emails above.
- The Dashboard includes a shared days-together counter and Shazy/Kabir diary walls. Posts, likes, comments, replies, and short voice replies are saved in Cloud Firestore.
- The Dashboard uses one shared couple feed for text and photo posts. Each person can edit or delete their own posts; both can like, comment, and reply.
- The floating pencil opens a live shared drawing canvas with color, brush size, eraser, undo, clear, online presence, and a saved drawing history. On the first drawing save, the app creates an `Our Little World Drawings` folder inside the configured shared Drive folder, shares it with the other account, and stores each PNG there. Both accounts need to grant Google Drive access on their first use.
- Diary photo uploads use the Google Drive browser OAuth flow. Google Drive API is enabled for the project, and the Web OAuth client is configured for `https://ayfa2011.github.io`. Its client ID and the shared folder ID are set in `config/app-config.js`. OAuth is in Testing mode with `akabeeram@gmail.com` and `hizasgallery@gmail.com` as test users; each person signs in to Google and grants Drive access when uploading or opening a photo. The Drive folder must also be shared with both accounts.
- Firebase Storage may still require a paid plan for this project; diary photos go to the shared Google Drive folder after its OAuth settings are supplied.
- The More > Profile screen shows only the signed-in partner's profile, and Firestore rules limit profile edits to that account. Display names and bios update across shared content. Profile photos upload to the shared Google Drive folder; replacing a photo leaves the previous Drive file untouched. The initial profiles use sample portrait photos and bios that can be replaced.

## Rules files
`firebase/firestore.rules`, `firebase/database.rules.json`, and `firebase/storage.rules` are local source files. The updated Firestore profile-edit restriction is local and must be published to Firebase to take effect. The Storage rules are not published because Firebase Storage is not yet set up for this project.
