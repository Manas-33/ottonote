function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

export const config = {
  supabaseUrl: required("VITE_SUPABASE_URL", import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: required(
    "VITE_SUPABASE_ANON_KEY",
    import.meta.env.VITE_SUPABASE_ANON_KEY
  ),
  apiBaseUrl: required("VITE_API_BASE_URL", import.meta.env.VITE_API_BASE_URL),

  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined,
  slackClientId: import.meta.env.VITE_SLACK_CLIENT_ID as string | undefined,
  slackClientSecret: import.meta.env.VITE_SLACK_CLIENT_SECRET as string | undefined,
  notionClientId: import.meta.env.VITE_NOTION_CLIENT_ID as string | undefined,
  notionClientSecret: import.meta.env.VITE_NOTION_CLIENT_SECRET as string | undefined,
};
