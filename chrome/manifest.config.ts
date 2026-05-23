import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "OttoNote",
  version: "0.0.1",
  description: "Capture browser meetings and turn them into structured notes.",
  action: {
    default_popup: "src/popup/index.html",
    default_title: "OttoNote",
  },
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  permissions: [
    "tabCapture",
    "offscreen",
    "sidePanel",
    "storage",
    "identity",
    "activeTab",
    "tabs",
    "scripting",
    "downloads",
  ],
  host_permissions: [
    "http://localhost:8000/*",
    "https://*.supabase.co/*",
    "https://meet.google.com/*",
    "https://*.zoom.us/*",
    "https://teams.microsoft.com/*",
  ],
});
