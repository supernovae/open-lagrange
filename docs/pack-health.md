# Pack Health

Pack health explains whether installed packs are visible to the runtime and ready for use.

```sh
open-lagrange pack health
open-lagrange pack health local.markdown-transformer
```

Each status includes:

- `loaded`: whether the pack is registered in `PackRegistry`
- `validation_status`: latest validation result from install
- `capabilities_registered`: descriptors exposed to capability discovery
- `required_secret_refs` and `missing_secret_refs`
- `oauth_status`
- `errors` and `warnings`

Example:

```json
{
  "pack_id": "local.markdown-transformer",
  "status": "healthy",
  "validation_status": "pass",
  "loaded": true,
  "capabilities_registered": ["local.markdown-transformer.transform_markdown"],
  "required_secret_refs": [],
  "missing_secret_refs": []
}
```
