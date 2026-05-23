export const STATE_KEY = "ottonote/capture";

export type CaptureState = {
  state:
    | "idle"
    | "recording"
    | "uploading"
    | "processing"
    | "done"
    | "failed";
  startedAt?: number;
  lastEvent?: string;
  meetingId?: string;
};

export async function getState(): Promise<CaptureState> {
  const { [STATE_KEY]: s } = await chrome.storage.local.get(STATE_KEY);
  return (s as CaptureState | undefined) ?? { state: "idle" };
}

export async function setState(partial: Partial<CaptureState>): Promise<void> {
  const current = await getState();
  await chrome.storage.local.set({
    [STATE_KEY]: { ...current, ...partial },
  });
}

export async function resetState(): Promise<void> {
  await chrome.storage.local.set({ [STATE_KEY]: { state: "idle" } });
}
