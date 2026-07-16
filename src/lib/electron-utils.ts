export function isElectron(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as any).electronAPI?.isElectron;
}

export async function getElectronSchoolSlug(): Promise<string | null> {
  if (!isElectron()) return null;
  try {
    return await (window as any).electronAPI.getSchoolSlug();
  } catch {
    return null;
  }
}

export async function setElectronSchoolSlug(slug: string): Promise<void> {
  if (!isElectron()) return;
  await (window as any).electronAPI.setSchoolSlug(slug);
}

export async function clearElectronSchoolSlug(): Promise<void> {
  if (!isElectron()) return;
  await (window as any).electronAPI.clearSchoolSlug();
}
