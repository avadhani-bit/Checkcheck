# Checkcheck

Mobile-first personal task manager. Work projects, shopping list, personal to-dos, and recurring chores with trend tracking.

## Go live (3 steps)

### 1. Add your GitHub Pages domain to Firebase Auth

In Firebase console → **Authentication → Settings → Authorized domains**  
Add: `YOUR-GITHUB-USERNAME.github.io`

### 2. Push to GitHub

- Open GitHub Desktop
- Add this folder as a local repository
- Commit all files with message "init"
- Publish to GitHub → create repo named `checkcheck`
- Push

### 3. Enable GitHub Pages

- Go to your repo on github.com
- **Settings → Pages → Source**: `main` branch, `/ (root)` → Save
- Your app is live at: `https://YOUR-USERNAME.github.io/checkcheck`

---

## Firestore security rules

Already set if you followed the setup. To verify, go to  
Firebase console → Firestore → Rules and confirm it matches `firestore.rules`.

---

## File structure

```
checkcheck/
  index.html          ← app shell (all screens)
  css/app.css         ← all styles
  js/app.js           ← all logic + Firebase
  firestore.rules     ← copy into Firebase console
  README.md
```

## Adding wife's shared shopping list (future)

When ready: create a `/households/{householdId}/shopping` collection in Firestore,  
give both accounts read/write via a household membership rule,  
and update the shopping collection path in `js/app.js`.
