# Ten X Better Projects — Website

A public website for Ten X Better Projects Limited. It reads and writes to the
**same Firebase project** as the Flutter app (Firestore for data, Cloudinary
for photo/video uploads) — so an application submitted on the website shows up
instantly in the app's admin dashboard, and vice versa.

## Pages
- `index.html` — Home page (services, procedure, contact)
- `apply.html` — 5-step application form (writes to the `applications` collection)
- `track.html` — Search by phone/NRC, see live status + progress updates
- `showcase.html` — "What We Do" gallery (reads the `showcase` collection)

There is **no admin panel** here on purpose — admin actions stay in the Flutter app.

## Before you deploy: check Firestore rules

This site reads and writes to Firestore directly from the browser, using the
same open rules you set earlier for testing:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

This is fine for now, but before real public use you'll eventually want to
tighten this (e.g. restrict `write` on `applications` and block writes to
`showcase` entirely from the public site).

## How to deploy on GitHub Pages (free)

1. Create a new GitHub repository (e.g. `ten-x-better-projects-web`)
2. Upload all these files, **keeping the folder structure** (`css/`, `js/`,
   and the `.html` files at the root)
3. Go to your repo → **Settings → Pages**
4. Under "Source", choose **Deploy from a branch**, select branch `main`,
   folder `/ (root)`, then **Save**
5. GitHub will give you a live URL like:
   `https://yourusername.github.io/ten-x-better-projects-web/`

That's it — no build step, no server needed. Any changes you push to the repo
go live within a minute or two.

## Notes
- The Firebase and Cloudinary credentials are safe to be public in this
  client-side code — this is normal for Firebase web apps. Security is
  enforced through Firestore Rules, not by hiding the config.
- If you rename Firestore fields or collections in the Flutter app later,
  update `js/apply.js`, `js/track.js`, and `js/showcase.js` to match.
