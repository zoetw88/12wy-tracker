export interface AppProfile {
  id: string;
  name: string;
}

const PROFILES_KEY = "profiles";
const ACTIVE_KEY = "active_profile";
export const PROFILE_EVENT = "profile-change";

const DEFAULT_PROFILE: AppProfile = { id: "default", name: "Main" };

export function listProfiles(): AppProfile[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILES_KEY) || "[]");
    if (Array.isArray(parsed) && parsed.length > 0) {
      const profiles = parsed.map((p) =>
        p?.id === DEFAULT_PROFILE.id && (p?.name === "主線" || p?.name === "Principal")
          ? DEFAULT_PROFILE
          : p
      );
      localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
      return profiles;
    }
  } catch {}
  localStorage.setItem(PROFILES_KEY, JSON.stringify([DEFAULT_PROFILE]));
  return [DEFAULT_PROFILE];
}

export function activeProfile(): AppProfile {
  const profiles = listProfiles();
  const activeId = localStorage.getItem(ACTIVE_KEY) || DEFAULT_PROFILE.id;
  return profiles.find((p) => p.id === activeId) || profiles[0];
}

export function activeProfileId(): string {
  return activeProfile().id;
}

export function addProfile(name: string): AppProfile {
  const clean = name.trim();
  if (!clean) throw new Error("請輸入 profile 名稱");
  const profiles = listProfiles();
  if (profiles.some((p) => p.name.trim().toLowerCase() === clean.toLowerCase())) {
    throw new Error("profile 名稱已存在");
  }
  const profile = {
    id: `p_${Date.now().toString(36)}`,
    name: clean,
  };
  localStorage.setItem(PROFILES_KEY, JSON.stringify([...profiles, profile]));
  setActiveProfile(profile.id);
  return profile;
}

export function deleteProfile(id: string): AppProfile {
  const profiles = listProfiles();
  if (profiles.length <= 1) throw new Error("至少需要保留一個 profile");
  const next = profiles.filter((p) => p.id !== id);
  if (next.length === profiles.length) return activeProfile();
  localStorage.setItem(PROFILES_KEY, JSON.stringify(next));
  removeProfileLocalKeys(id);
  const activeId = localStorage.getItem(ACTIVE_KEY);
  if (activeId === id) {
    setActiveProfile(next[0].id);
    return next[0];
  }
  window.dispatchEvent(new CustomEvent(PROFILE_EVENT));
  return activeProfile();
}

export function setActiveProfile(id: string) {
  localStorage.setItem(ACTIVE_KEY, id);
  window.dispatchEvent(new CustomEvent(PROFILE_EVENT));
}

export function profileKey(key: string, profileId = activeProfileId()): string {
  return `${profileId}:${key}`;
}

function removeProfileLocalKeys(profileId: string) {
  const prefix = `${profileId}:`;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  for (const key of keys) localStorage.removeItem(key);
}
