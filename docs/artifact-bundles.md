# Artifact Bundles

Artifact bundles are directory or ZIP exports built from selected indexed artifacts. Every bundle includes a JSON manifest unless disabled by the caller.

Bundles preserve:

- artifact IDs
- artifact kinds
- titles and summaries
- content types
- lineage references
- checksums where available

The bundle writer validates archive paths to prevent path traversal. ZIP entries are sanitized before writing.

Output writes go only to artifact storage or a caller-specified path after policy validation. The Output Pack does not publish externally.
