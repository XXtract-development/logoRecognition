# Production Coolify compose loading investigation

## Symptom and evidence
The new dedicated application f048gs04scoksggw0okw4oo0 exists and has its private production environment. A synchronous loadComposeFile reads the correct published compose file, saves docker_compose_raw, then the normal parser refuses the bind source `${MINIO_DATA_PATH:?required dedicated production StorageBox directory}` as an unsafe literal Docker volume path. No deployment or container start occurred. Existing production is unchanged.

## Hypotheses
- Confirmed: default Coolify parser treats an otherwise valid Compose env substitution in the bind path as forbidden shell syntax.
- Refuted: missing repository access; the raw compose was downloaded before parser failure.
- Open: dedicated raw-compose deployment can preserve the reviewed env substitutions, networks, profiles and explicit staged start command.

## Owner and fix direction
Deployment integration owned by this repository and the new dedicated Coolify application settings. Inspect installed deployment implementation, then enable only this application’s supported raw-compose setting if its command and environment handling meet the reviewed contract. Validate the rendered file privately before any deployment; otherwise use concrete safe deployment-specific paths. Do not alter global Coolify parsing or existing applications.

## Confirmed correction and verification
The installed deployment calls loadComposeFile even in raw mode, and oldRawParser appends sequence labels. The dedicated bind source is now literal and the validator requires exactly the corresponding production resource and env path; all Traefik labels are strings in a list. All 32 offline configuration checks pass. Banana mountpoint/findmnt confirmed cifs StorageBox before the owned directory was created; it did not exist previously. The new authentication identity was created with SELECT only on the existing central users table, restricted to Banana private address, without modifying existing users. The staged raw custom command refers to the installed writer's docker-compose.yaml under the new application's own workdir, with an explicit project name/directory and only the three infrastructure services. The build command is config --quiet, not an image build.
