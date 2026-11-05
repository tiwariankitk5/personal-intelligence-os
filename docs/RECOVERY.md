# Recover PIOS on another computer

Source code lives on codex/complete-note-workspace and on the private recovery release tag. Rebuildable dependencies/caches are deliberately excluded. The private release holds a portable Windows companion, source Git bundle, demo assets and an authenticated encrypted data snapshot. That snapshot includes PostgreSQL users/notes/Draft/learning/provider settings, uploads, the original .env (including the key needed to decrypt stored AI credentials), source bundle, validation evidence and supplied video references.

## Fresh-device recovery

Install Git, Node.js 22+, Docker Desktop with Linux containers (or Docker Engine/Compose on Linux), and GitHub CLI. Sign in to your GitHub account with gh auth login, then gh auth setup-git. You need access to the private repository.

1. Clone the release tag shown on the private recovery release: git clone --branch RELEASE_TAG https://github.com/tiwariankitk5/personal-intelligence-os.git
2. Enter the checkout. Download its .piosbackup asset with: gh release download RELEASE_TAG --repo tiwariankitk5/personal-intelligence-os --pattern '*.piosbackup' --dir .recovery/download
3. If you saved the recovery key separately, put it in .recovery/keys/recovered-key.txt. Otherwise run: node scripts/recover-github-key.mjs
4. Verify: node scripts/pios-recovery.mjs verify --input .recovery/download/BACKUP_FILENAME --key-file .recovery/keys/recovered-key.txt
5. Restore into a fresh local project: node scripts/pios-recovery.mjs restore --input .recovery/download/BACKUP_FILENAME --key-file .recovery/keys/recovered-key.txt --project pios-recovered
6. Open the frontend address reported by the command. Sign in with your original PIOS account. The original database password and provider-encryption key are restored; do not regenerate them. Backend sessions are intentionally not copied.

The key-retrieval script creates a temporary branch through the GitHub API and triggers a private-only workflow. Repository write access is required. It downloads a one-day key artifact, then deletes the cloud artifact and temporary branch. The protected repository secret remains available for later recovery. Keep an additional offline/password-manager copy of the key; do not make the repository public or rotate/delete its recovery secret without migrating backups.

The restore command refuses existing project containers/volumes and refuses to overwrite .env. To validate beside a running app, specify --project pios-recovery-validation --env-output .recovery/restored/validation.env --frontend-port 3140 --backend-port 8380 --db-port 5732 --disable-workers. This prevents restored embedding workers from calling external providers. Use the returned environment file with docker compose --env-file ENV_FILE -p PROJECT for subsequent management.

## Create another saved-data snapshot

Run node scripts/pios-recovery.mjs backup --publish-key --output .recovery/snapshots/NEW_NAME.piosbackup. The backend briefly stops for a consistent database/uploads snapshot and is restarted even if capture fails. Save open edits before running it and sign in again afterward. Plain staging files are cleaned up. The output is AES-256-GCM encrypted with a random 256-bit recovery key. The key is excluded from Git and stored separately as PIOS_RECOVERY_KEY in GitHub Actions secrets; a non-secret fingerprint guards accidental key replacement.

Verify with the command above, then upload the encrypted snapshot/checksum to a new private prerelease: gh release create NEW_TAG BACKUP_FILE BACKUP_FILE.sha256 --repo tiwariankitk5/personal-intelligence-os --target COMMIT_SHA --prerelease --latest=false --title 'PIOS recovery snapshot' --notes-file RELEASE_NOTES_FILE. Do not upload raw .env, raw database dumps or plaintext recovered keys. Never overwrite an older known-good recovery snapshot.

GitHub stores the current snapshot, not future unsaved work. Commit/push new source changes and create another data snapshot when needed. This is not a scheduled/live backup service. Browser-only layout preferences and expired sign-in cookies are not recovery data. Desktop side preference may be chosen again. Dependencies and images are rebuilt from committed manifests/lockfiles; physical Mac/mobile behavior is not certified by a Windows restore drill.

## Reinstall optional browser-test tools

Run npm ci --prefix tools/browser after cloning; the exact Playwright dependency and lockfile are committed. Windows smoke scripts use an installed Microsoft Edge browser. These development dependencies are rebuilt rather than backed up as node_modules. The native smoke also needs npm ci --prefix desktop and the Electron install script if npm lifecycle scripts were disabled.

## Verified recovery snapshot — 2026-11-06

The private prerelease pios-recovery-2026-11-06 includes pios-data-2026-11-06.piosbackup, its checksum, the source Git bundle, Windows portable ZIP, demo/previews ZIP and a verification report. The snapshot authenticated all 148 payload file checksums. A fresh pios-recovery-validation project restored the database with matching row counts/content digests and matching upload hashes, preserved the three original application secrets, and returned HTTP 200 for API and frontend. Restored embedding workers were disabled. The key was recovered through the private GitHub workflow and matched the local key.

Fresh clone command for this snapshot:

git clone --branch pios-recovery-2026-11-06 https://github.com/tiwariankitk5/personal-intelligence-os.git

Use pios-data-2026-11-06.piosbackup as BACKUP_FILENAME in the steps above. The release is a recovery snapshot, not a public production release.
