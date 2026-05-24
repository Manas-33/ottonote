import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "OttoNote",
  version: "0.0.1",
  description: "Capture browser meetings and turn them into structured notes.",
  // Pins the extension ID across machines and packaged/unpacked installs.
  // Paired private key lives in chrome/key.pem (gitignored).
  key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1vpG5nwMyFBPkiZSIhcweKhRm5yCyG+EO1dsVgQdsE+z1N451mkbYK+QqR4GI+z9lY/ZefBMZ+YDA74eEHN31ZsPT8okA5H0YhKcjMnoXVe/RKO20ZW7KFwSIeRMqNVbsUq68GE3y80aMhaliG7UADT7kukgvndq4ktFyQ44AV6jmPiEARdeKEkB2lZiokh87t4ME4E08jzAYmF8hFd9cLxAF8uzVB7lCiy6cxAbivHV1gVRx6b9noVLJjAEmsyvpGCCmWgqn1jgS84ea6PLQo2LV5hRhe6oKgF4jOhKsc0VCIS3fb0YQxHln0UNg6SQQmt7D1WPtH4wUhF+hOfbGQIDAQAB",
  action: {
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
    "<all_urls>",
  ],
  content_scripts: [
    {
      matches: [
        "https://meet.google.com/*",
        "https://*.zoom.us/*",
        "https://teams.microsoft.com/*",
      ],
      js: ["src/content/detect.ts"],
      run_at: "document_idle",
    },
  ],
});
