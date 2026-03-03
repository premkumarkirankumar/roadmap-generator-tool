# Roadmap Generator Tool

A lightweight starter project for generating roadmap outlines from user input.

## Structure

- `frontend`: Vite + React UI for collecting inputs and previewing a generated roadmap
- `backend`: Express API stub for future server-side generation logic

## Getting Started

1. Install dependencies in the root, frontend, and backend folders.
2. Run `npm run dev` from the project root to start both apps.

## Current Scope

This starter intentionally focuses on a clean project shape and a working front-end template. The generation logic is lightweight and easy to replace.

## Firebase Hosting Deploy

This repo is prepared for Firebase Hosting.

- Hosting config is in [firebase.json](/Users/kiran/Documents/Documents - Kiran’s MacBook Pro/budjet-poc/roadmap-generator-tool/firebase.json)
- The real Firebase project mapping should be created in `.firebaserc`
- A template is included in [.firebaserc.example](/Users/kiran/Documents/Documents - Kiran’s MacBook Pro/budjet-poc/roadmap-generator-tool/.firebaserc.example)

### Deploy flow

1. Create a Firebase project in the Firebase console.
2. Enable Hosting for that project.
3. Copy `.firebaserc.example` to `.firebaserc` and replace the placeholder project id.
4. Run `npm run build` from the project root.
5. Run `npm run deploy:hosting` from the project root.

### Current data storage

- Roadmap imports, snapshots, and import diffs are currently stored in the browser using `localStorage`.
- That means the history is preserved per browser/device, not shared across users yet.
- If you later want shared storage across users, the next step is to move import snapshots into Firestore.

## Shared Snapshot Storage (Firestore)

The frontend is now prepared to use Firestore for shared snapshot persistence across browsers and machines.

### What you need to do

1. In Firebase, add a Web App to your project.
2. Copy the Firebase web app config values into `frontend/.env.local`.
3. Enable Cloud Firestore in the Firebase console.
4. Choose a Firestore rules mode that matches your access model.

### Env file

Copy [frontend/.env.example](/Users/kiran/Documents/Documents - Kiran’s MacBook Pro/budjet-poc/roadmap-generator-tool/frontend/.env.example) to `frontend/.env.local` and replace the placeholder values.

### Important note

- Without Firebase web app config in `frontend/.env.local`, the app falls back to browser `localStorage`.
- Once configured, imports and snapshot diffs are written to Firestore so they can be seen on other browsers and machines.
