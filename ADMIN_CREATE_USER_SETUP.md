# Deploying `admin-create-user` Edge Function

The Team Management → **Add User** dialog now calls a Supabase Edge Function
instead of `supabase.auth.signUp`. This is required because:

- `signUp` from the browser would swap the admin's session for the new
  user's — the admin would get logged out as soon as they click Create.
- `signUp` honours the project's email-confirmation policy, which blocks
  the new user from signing in until they click the verification email.

The Edge Function uses the service-role key to create the user with
`email_confirm: true` and writes the profile row directly, so the
new user can sign in immediately with the email + password the admin set.

## One-time deploy

From the repo root:

```bash
npx supabase functions deploy admin-create-user \
  --project-ref jyfwyfpwbbgfpsntubfy
```

If you haven't authenticated before:

```bash
npx supabase login
```

The function requires no extra env vars — Supabase automatically injects
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY`.

## What the function does

1. Reads the caller's JWT from the `Authorization` header.
2. Looks up the caller's profile and verifies their role is `admin` or
   `design_coordinator`. Anyone else gets a 403.
3. Validates the request body (email, password ≥ 8 chars, full name, role
   ∈ {admin, design_coordinator, designer, deo}).
4. Calls `auth.admin.createUser` with `email_confirm: true` and the user's
   metadata.
5. Upserts the `profiles` row with the chosen role + name. If the upsert
   fails, the auth user is rolled back so we never leave an orphan.
6. Returns `{ id, email, full_name, role }`.

## Testing manually

```bash
curl -X POST \
  https://jyfwyfpwbbgfpsntubfy.functions.supabase.co/admin-create-user \
  -H "Authorization: Bearer <ADMIN_USER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newhire@example.com",
    "password": "test1234",
    "full_name": "New Hire",
    "role": "designer"
  }'
```

You can get an admin user's JWT from the browser DevTools while logged in:
`localStorage` → look for the `sb-<project-ref>-auth-token` key and grab
the `access_token`.

## Roles supported

| Role | What they can do |
|---|---|
| `admin` | Full access |
| `design_coordinator` | Full access except some destructive admin actions |
| `designer` | Their own tasks + brief / concept submission |
| `deo` | Data-entry operator — Knitting Queue only |

The dropdown in the dialog ([TeamView.tsx](linkd-fms/src/views/TeamView.tsx))
pulls labels from `ROLE_LABELS` in `@/lib/constants` so they stay in sync.

## Failure modes + how the dialog surfaces them

- **Email already exists** — Supabase returns 422 with
  `User already registered`. Dialog shows: *"A user with this email already exists."*
- **Weak password** — Supabase returns 422 with
  `Password should be at least 6 characters` (or your project's minimum).
- **Caller not admin/coordinator** — function returns 403 with
  `Only admins or design coordinators can create users`.
- **Profile upsert fails** — function deletes the just-created auth user,
  returns 500 with the underlying error. No orphan, safe to retry.

## What about the existing `handle_new_user` trigger?

The trigger (defined in `0006_simplify_roles.sql`) auto-creates a profile
row with `role='designer'` whenever an auth user is created. The Edge
Function's upsert runs AFTER that trigger, so the canonical role from the
function always wins. No DB migration is needed.
