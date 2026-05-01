import type { PrimitiveContext } from "@open-lagrange/capability-sdk/primitives";
import { SearchProviderConfig, type SearchProvider, type SearchProviderConfig as SearchProviderConfigType } from "./search-provider.js";
import { createManualUrlProvider } from "./providers/manual-url-provider.js";
import { createSearxngProvider } from "./providers/searxng-provider.js";
import { createFixtureProvider } from "./providers/fixture-provider.js";

export interface SearchProviderRegistryOptions {
  readonly context: PrimitiveContext;
  readonly configs?: readonly SearchProviderConfigType[];
  readonly allow_fixture?: boolean;
}

export class SearchProviderRegistry {
  private readonly providers: readonly SearchProvider[];

  constructor(options: SearchProviderRegistryOptions) {
    const configured = (options.configs ?? []).flatMap((config) => providerFromConfig(options.context, config));
    this.providers = [
      createManualUrlProvider(),
      ...configured,
      ...(options.allow_fixture ? [createFixtureProvider()] : []),
    ];
  }

  list(): readonly SearchProvider[] {
    return this.providers;
  }

  get(providerId: string): SearchProvider | undefined {
    return this.providers.find((provider) => provider.provider_id === providerId);
  }
}

export function parseSearchProviderConfigs(value: unknown): readonly SearchProviderConfigType[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = SearchProviderConfig.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

function providerFromConfig(context: PrimitiveContext, config: SearchProviderConfigType): readonly SearchProvider[] {
  if (config.kind === "searxng") return [createSearxngProvider(context, config)];
  return [];
}
