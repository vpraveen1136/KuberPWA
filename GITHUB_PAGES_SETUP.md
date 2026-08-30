# Kuber GitHub Pages Setup

This repo should contain only the PWA code. Do not commit backup JSON files, statement PDFs, card exports, or CSV files.

## 1. Create The GitHub Repo

Create a new GitHub repository named:

```text
kuber-pwa
```

Recommended visibility:

```text
Private
```

## 2. Push From This Folder

Run these commands inside:

```text
D:\Developer\Kuber\pwa
```

```powershell
git remote add origin https://github.com/YOUR-GITHUB-USERNAME/kuber-pwa.git
git push -u origin main
```

## 3. Enable GitHub Pages

In the GitHub repo:

1. Open `Settings`.
2. Open `Pages`.
3. Under `Build and deployment`, choose `GitHub Actions`.
4. Wait for the `Deploy Kuber PWA to GitHub Pages` action to finish.

Your test URL will look like:

```text
https://YOUR-GITHUB-USERNAME.github.io/kuber-pwa/
```

## 4. Test On iPhone

1. Open the GitHub Pages URL in iPhone Safari.
2. Tap Share.
3. Tap `Add to Home Screen`.
4. Open `Kuber` from the Home Screen.
5. Import your backup JSON inside the app.
6. Open `More > Settings > PWA Status`.
7. Open `More > Backup & Restore` and confirm Storage Health and Migration Check.

## Privacy Notes

- GitHub hosts only the app code.
- Your imported backup data stays in the iPhone browser's local IndexedDB.
- Do not upload your backup JSON, statement PDFs, images, or CSV files to GitHub.
- Export a full backup from the app after testing important changes.
