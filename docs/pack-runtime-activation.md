# Pack Runtime Activation

Installed local packs are activated on runtime startup through the profile pack registry.

Default install path:

```text
~/.open-lagrange/profiles/<profile>/packs/trusted-local/<pack_id>/
~/.open-lagrange/profiles/<profile>/packs/registry.json
```

Startup behavior:

1. Read the profile `registry.json`.
2. Validate every registry entry and installed `open-lagrange.pack.yaml`.
3. Load only trusted-local packs with `validation_status: pass`.
4. Register manifest-backed capability descriptors in `PackRegistry`.
5. Refuse experimental codegen packs unless explicit runtime trust metadata is present.

The runtime does not dynamically import generated TypeScript source during startup. Phase 2 activation uses manifest-backed descriptors and dry-run-safe template execution, so generated code stays reviewable until a stronger isolation model is added.

Useful commands:

```sh
open-lagrange pack build examples/skills-markdown-transformer/skills.md --dry-run
open-lagrange pack validate .open-lagrange/generated-packs/local.markdown-transformer
open-lagrange pack install .open-lagrange/generated-packs/local.markdown-transformer
open-lagrange restart
open-lagrange pack health local.markdown-transformer
open-lagrange pack smoke local.markdown-transformer
```
