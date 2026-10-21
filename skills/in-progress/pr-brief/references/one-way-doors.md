# One-way doors: the baseline

A repo's own `## One-way doors` section adds to this list.
The bold label is the rule name the assessor writes under `Rules checked`.

- **Persisted shape**: a migration, or a change to the shape of data written to a database, file, cache, or queue.
- **Deletion**: deleting, truncating, or overwriting stored data or files other than this change's own build output.
- **Outward effect**: sending, publishing, or charging: email, notifications, webhooks, payments, a package publish, a release, a post to another service.
- **Public contract**: changing or removing something callers outside this diff rely on: an exported API, wire format, CLI flag or command, URL or route, event name, config key; adding one is two-way.
- **Access**: authentication, authorisation, permissions, secrets, or a security boundary.
- **Deploy surface**: infrastructure, deploy or CI configuration, and environment variables the deployed product reads.
- **Major dependency**: a major version bump, or a new runtime dependency.
