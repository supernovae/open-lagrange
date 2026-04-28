import { RuntimeConfig, RuntimeProfile, type RuntimeConfig as RuntimeConfigType, type RuntimeProfile as RuntimeProfileType } from "./types.js";
import { defaultLocalProfile, defaultProfileSecretRefs, loadConfig, saveConfig } from "./config.js";
import { getRuntimePaths } from "./paths.js";

export async function getCurrentProfile(): Promise<RuntimeProfileType> {
  const config = await loadConfig();
  const profile = config.profiles[config.currentProfile];
  if (!profile) throw new Error(`Current profile not found: ${config.currentProfile}`);
  return profile;
}

export async function setCurrentProfile(name: string): Promise<RuntimeConfigType> {
  const config = await loadConfig();
  if (!config.profiles[name]) throw new Error(`Profile not found: ${name}`);
  const next = RuntimeConfig.parse({ ...config, currentProfile: name });
  await saveConfig(next);
  return next;
}

export async function addLocalProfile(name: string, runtime: "docker" | "podman"): Promise<RuntimeConfigType> {
  const config = await loadConfig();
  const profile = RuntimeProfile.parse({ ...defaultLocalProfile({ runtime, composeFile: getRuntimePaths().composePath }), name, runtimeManager: runtime, secretRefs: defaultProfileSecretRefs(name) });
  const next = RuntimeConfig.parse({ ...config, profiles: { ...config.profiles, [name]: profile } });
  await saveConfig(next);
  return next;
}

export async function addRemoteProfile(name: string, apiUrl: string): Promise<RuntimeConfigType> {
  const config = await loadConfig();
  const refs = defaultProfileSecretRefs(name);
  const profile = RuntimeProfile.parse({
    name,
    mode: "remote",
    ownership: "external",
    apiUrl,
    runtimeManager: "external",
    auth: { type: "token", tokenRef: refs.open_lagrange_token },
    secretRefs: {
      open_lagrange_token: refs.open_lagrange_token,
    },
  });
  const next = RuntimeConfig.parse({ ...config, profiles: { ...config.profiles, [name]: profile } });
  await saveConfig(next);
  return next;
}

export async function removeProfile(name: string): Promise<RuntimeConfigType> {
  const config = await loadConfig();
  const { [name]: _removed, ...profiles } = config.profiles;
  const currentProfile = config.currentProfile === name ? Object.keys(profiles)[0] : config.currentProfile;
  if (!currentProfile) throw new Error("Cannot remove the last profile.");
  const next = RuntimeConfig.parse({ currentProfile, profiles });
  await saveConfig(next);
  return next;
}
