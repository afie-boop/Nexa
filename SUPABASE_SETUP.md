# Supabase Free setup for AXMchat Memory

The Brain memory store already supports any PostgreSQL database through the `DATABASE_URL` environment variable. Supabase does not require a vendor-specific code change.

## 1. Create the Supabase project

1. Create a project on the Supabase Free plan.
2. Choose a region close to the Render service (Singapore is a sensible choice for this deployment).
3. Set and save the database password securely.

## 2. Copy the PostgreSQL connection string

In the Supabase project, open **Connect** and select the **Session pooler** connection string. Use the PostgreSQL URI supplied by Supabase. Do not use the Supabase publishable/anon key or service-role key as `DATABASE_URL`.

The connection string contains a database password. Keep it private and do not commit it to GitHub or paste it into source code.

## 3. Configure Render

In the AXMchat backend service on Render:

1. Open **Environment**.
2. Add or update `DATABASE_URL` with the Supabase Session pooler URI.
3. Keep `NODE_ENV=production` so the existing PostgreSQL client uses SSL.
4. Save changes and redeploy/restart the backend.

Do not remove the old Render Postgres database until its data has been exported or you have confirmed it is no longer needed.

## 4. Verify

After deployment, inspect the backend logs for:

```
Brain initialized with persistent Postgres memory store.
```

Then send a test chat that creates a durable memory and verify it appears in the Brain memory list. The application creates the `axmchat_memories` table and its indexes automatically when the first database-backed Brain operation runs.

## Notes

- The app uses `pg` and `DATABASE_URL` already; no Supabase SDK is required for this PostgreSQL-backed memory store.
- Supabase Free has usage limits and may pause inactive projects. Check current Supabase plan limits before relying on it for production.
- This setup connects a new database; it does not automatically migrate data from the suspended Render database.
