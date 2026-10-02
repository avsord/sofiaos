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

## Live prerequisites — not yet verified

1. Obtain authenticated Railway access; identify the service and environment serving sofiaos.up.railway.app.
2. Back up current database, owner-auth state, credentials and encryption material without printing their values.
3. Confirm a real attached volume and compare its mount path with SOFIA_DATA_DIR / the effective data path. Mounting a new empty volume over live data can hide that data; restore the backup before switching traffic.
4. Verify private readiness and both app/web sessions before and after one controlled redeploy. Do not claim success based only on /health or on the unit tests.

No password, password policy, authentication bypass, API key, or user account data is changed by this patch. The requested password change still needs an authorized account-management operation. The current tests use synthetic nonworking credentials only.

Reference: https://docs.railway.com/volumes
