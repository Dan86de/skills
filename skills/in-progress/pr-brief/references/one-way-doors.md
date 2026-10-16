# One-way doors: the baseline

Changes every repo treats as one-way.
A repo adds its own under a `## One-way doors` heading in its standards file, and those add to this list rather than replace it.

Each rule is named by its bold label, which is what the assessor writes under `Rules checked`.

- **Persisted shape**: a migration, or any change to the shape of data written to a database, file, cache, or queue. Once data is written in the new shape, reverting the code does not unwrite it.
- **Deletion**: code that deletes, truncates, or overwrites stored data or files that are not this change's own build output.
- **Outward effect**: anything that sends, publishes, or charges: email, notifications, webhooks, payments, a package publish, a release, a post to another service.
- **Public contract**: a change to, or removal of, something that callers this diff does not update rely on: an exported API, a wire format, a CLI flag or command, a URL or route, an event name, a config key. Adding a new one is not a one-way door; changing or removing an existing one is.
- **Access**: authentication, authorisation, permissions, secrets, or a security boundary.
- **Deploy surface**: infrastructure, deploy, or CI configuration, and environment variables the deployed product reads.
- **Major dependency**: a dependency that moves a major version, or a new runtime dependency.
