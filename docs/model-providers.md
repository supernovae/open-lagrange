# Model Providers

Open Lagrange supports named model provider profiles. Runtime config stores provider names, endpoints, model names, and SecretRefs. Raw API keys stay in OS-native credential storage or env fallback.

## Recommended Setup

Use one capable model first:

```sh
npm run cli -- model configure openai --model gpt-4o --high-model gpt-4o --coder-model gpt-4o
npm run cli -- secrets set openai
```

Planning, coding, workflow generation, and review are easier to keep reliable with a stronger model. You can split slots later:

```sh
npm run cli -- model configure openrouter \
  --model openai/gpt-4o-mini \
  --high-model openai/gpt-4o \
  --coder-model anthropic/claude-3.5-sonnet
npm run cli -- secrets set openrouter
```

## Model Slots

Each provider profile has:

- `default`: general cognitive steps.
- `high`: planning, goal framing, complex review, and escalation.
- `coder`: bounded repository implementation and repair work.

If only one model is configured, Open Lagrange uses it for every slot.

## Secret Convention

By convention, the profile secret key matches the provider ID:

```sh
npm run cli -- secrets set <provider_id>
```

The stored keychain account name is `<provider_id>-api-key`. Config still stores only the SecretRef.

Examples:

| Provider | Alias examples | Secret command | Default endpoint |
| --- | --- | --- | --- |
| `openai` | `gpt` | `npm run cli -- secrets set openai` | `https://api.openai.com/v1` |
| `openrouter` |  | `npm run cli -- secrets set openrouter` | `https://openrouter.ai/api/v1` |
| `deepinfra` |  | `npm run cli -- secrets set deepinfra` | `https://api.deepinfra.com/v1/openai` |
| `groq` |  | `npm run cli -- secrets set groq` | `https://api.groq.com/openai/v1` |
| `xai` | `grok` | `npm run cli -- secrets set xai` | `https://api.x.ai/v1` |
| `fireworks` | `fireworks.ai` | `npm run cli -- secrets set fireworks` | `https://api.fireworks.ai/inference/v1` |
| `mistral` | `mistral-ai` | `npm run cli -- secrets set mistral` | `https://api.mistral.ai/v1` |
| `together` | `together-ai` | `npm run cli -- secrets set together` | `https://api.together.xyz/v1` |
| `kimi` | `moonshot` | `npm run cli -- secrets set kimi` | `https://api.moonshot.ai/v1` |
| `minimax` |  | `npm run cli -- secrets set minimax` | `https://api.minimax.io/v1` |
| `alibaba` | `qwen`, `dashscope` | `npm run cli -- secrets set alibaba` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` |
| `perplexity` |  | `npm run cli -- secrets set perplexity` | `https://api.perplexity.ai` |
| `cerebras` |  | `npm run cli -- secrets set cerebras` | `https://api.cerebras.ai/v1` |
| `azure_openai` | `azure` | `npm run cli -- secrets set azure_openai` | configure your deployment endpoint |
| `anthropic` | `claude` | `npm run cli -- secrets set anthropic` | native adapter future work |
| `google` | `gemini` | `npm run cli -- secrets set google` | native adapter future work |
| `cohere` |  | `npm run cli -- secrets set cohere` | native adapter future work |
| `replicate` |  | `npm run cli -- secrets set replicate` | native adapter future work |
| `mimo` |  | `npm run cli -- secrets set mimo` | configure endpoint if needed |
| `ollama` |  | no secret required by default | `http://localhost:11434/v1` |
| `lmstudio` | `lm-studio` | no secret required by default | `http://localhost:1234/v1` |
| `local` | `local-api` | optional | configurable OpenAI-compatible endpoint |

## CLI Commands

List known providers:

```sh
npm run cli -- model providers
```

Configure and activate a provider:

```sh
npm run cli -- model configure groq \
  --model llama-3.3-70b-versatile \
  --high-model llama-3.3-70b-versatile \
  --coder-model qwen-2.5-coder-32b
npm run cli -- secrets set groq
```

Configure a local endpoint:

```sh
npm run cli -- model configure local \
  --endpoint http://localhost:11434/v1 \
  --model qwen2.5-coder:32b \
  --high-model llama3.1:70b \
  --coder-model qwen2.5-coder:32b
```

Show configured provider status:

```sh
npm run cli -- model status
npm run cli -- model list
```

## Config Shape

```yaml
activeModelProvider: openrouter
modelProviders:
  openrouter:
    provider: openrouter
    endpoint: https://openrouter.ai/api/v1
    api_key_secret_ref: openrouter
    models:
      default: openai/gpt-4o-mini
      high: openai/gpt-4o
      coder: anthropic/claude-3.5-sonnet
secretRefs:
  openrouter:
    provider: os-keychain
    name: openrouter-api-key
    scope: profile
```

## Runtime Behavior

At runtime, trusted code resolves the active provider SecretRef and injects:

- `OPEN_LAGRANGE_MODEL_PROVIDER`
- `OPEN_LAGRANGE_MODEL_BASE_URL`
- `OPEN_LAGRANGE_MODEL_API_KEY`
- `OPEN_LAGRANGE_MODEL`
- `OPEN_LAGRANGE_MODEL_HIGH`
- `OPEN_LAGRANGE_MODEL_CODER`

OpenAI-compatible providers are routed through the existing OpenAI-compatible SDK path. Native provider adapters for providers with different wire protocols are future work.
