# Private filter durability — deployment hold

This patch is deliberately staged away from main. Do not deploy it until the live Railway service is inspected and backed up. The APK update is independent and must not modify server credentials.

## Findings in the source

The existing writer stores both a deployment-root .env and data/runtime-credentials.env but does not check whether the data directory is within a Railway volume. A write to either path is not evidence of persistence across deployments. The loader also lets an older non-empty bootstrap key supersede a later key saved in the web UI.

## Proposed correction

- Keep the existing data path; do not silently start a new empty database in a different location.
- Require the configured data directory to be inside RAILWAY_VOLUME_MOUNT_PATH before accepting a credential save on Railway. Refuse false success if the mount is absent, mismatched or redirected outside the volume by a symlink.
- Use a single owner-only atomic credential file inside that directory. Do not write secrets into the deploy directory.
- Read the file back before reporting success. Preserve unrelated routes and reject corrupt files without deleting them.
- Restore the last credential saved by the owner instead of undoing rotation with an old bootstrap key.
- Never use the shared credential as a substitute for the private credential.

## Railway metadata inspection — 2026-10-02

Railway is now connected. Do not ask the owner to install it again.

Successful native connector reads identified:

- Project: thorough-cooperation (745fe84e-589f-4ce0-8173-4204fa6d6ae3).
- Service: sofiaos (6fa5039a-d8ec-4651-8921-7cc01fd36f84).
- Environment: production (428b54ed-beb9-4af2-9166-dba83766638b).
- Domain: sofiaos.up.railway.app, routed to port 8080.
- Source: avsord/sofiaos, main.
- The returned service configuration has no volume-mount section and no staged changes.
- The returned variable names are SOFIA_LOGIN_EMAIL, SOFIA_LOGIN_PASSWORD, SOFIA_SMTP_PASS, SOFIA_SMTP_USER and WHATSAPP_VERIFY_TOKEN. Neither SOFIA_DATA_DIR nor OPENAI_PRIVATE_API_KEY is present in that returned list. No variable values were requested.
- Deployment 6660126a-7288-4d9b-8c5c-458f593b643f is reported successful and refers to source commit 192c6df0eeea9d548c453064dca7117b55f640ac. The available deploy-log query returned only Starting Container, not a storage or private-filter readiness check.

These metadata observations are not a filesystem inspection. In particular, absence from the environment-variable names does not prove a key is absent from a runtime file.

## Execution blocker — not an authorization request

The owner has authorized the repair. The attempted Railway agent operation to inspect live storage and preserve a backup was blocked by the tool's security controls before execution. No live backup, file migration, volume attachment, credential update or production redeploy was performed in this inspection. Do not retry the blocked operation through another tool, a changed command or a newly exposed application endpoint.

The exposed native Railway tools have configuration reads and standard service/variable/deploy operations, but no dedicated volume-attachment, runtime-file export or full live-backup action. Do not substitute a blind redeploy or an empty volume for a verified migration.

## Backup scope caveat

Source review of src/services/backup.js shows that the portable backup seals Store.export() and a vault key when present. It is useful for database records but is not a full runtime-filesystem backup and does not explicitly include owner-auth.json or runtime-credentials.env. A database backup alone must not be described as preservation of those credential files.

## Remaining live prerequisites

1. Through an authorized operator in Railway, preserve the current data directory, owner-auth state, credential file, backups and encryption material in owner-controlled storage without printing their contents or sharing them in chat. The SQLite copy must be consistent with any WAL.
2. Confirm the effective data path and an actual durable volume. Attach/migrate only after the preserved data is recoverable; mounting a new empty volume can hide existing data.
3. Apply the prepared code after the storage prerequisites are satisfied.
4. Verify private readiness and app/web access before and after a controlled redeploy. A successful /health response or the unit suite alone is not evidence that the private filter works in production.

No password, password policy, authentication bypass, API key or user account data is changed by this patch or this documentation update. The requested password change remains a separate authorized account-management operation. Tests use synthetic nonworking credentials only.

References: https://docs.railway.com/volumes ; https://docs.railway.com/deployments/reference
