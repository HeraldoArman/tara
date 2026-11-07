# Authentication frontend handoff

## Login

`/login` uses the existing `POST /api/v1/auth/login` contract with `username` and
`password`, through the shared API client. The server issues the session cookie;
the browser does not create a token or choose a role. Successful login navigates
to `/`, where existing server-side routing determines the user's workspace.
Inputs are locked while the request is pending, and an API error restores the
form for retry. Username whitespace is trimmed; the password is sent unchanged.

Both auth pages share `components/auth/auth-shell.tsx` and scoped `auth.css`.

## Registration boundary

`/register` presents the first-time company Head flow described in `tara.txt`.
Employees follow `/login` with their assigned company account. No role picker is
shown, and the browser does not grant a role or create an organization.

Registration is currently a frontend preview. **Review details** validates the
form locally and explains that no account has been created. It sends no API
request, sets no session cookie, persists no credentials, and does not redirect.
The availability notice appears before the user enters details.

The existing server has login, logout, and current-user endpoints, but no public
registration endpoint. `tara_server.admin.provision_user` is an authenticated
operator command for an existing organization, not a signup API.

## Proposed registration contract — not implemented

The backend teammate must confirm an endpoint and response before submission is
connected. A candidate request body matching the form is:

```ts
interface ProposedRegistrationRequest {
  companyName: string;
  name: string;
  username: string;
  password: string;
}
```

- `companyName`, `name`, and `username` should be trimmed before submission.
- `confirmPassword` is a client-only field and must never be sent.
- Passwords must not be trimmed, logged, stored in browser storage, or placed in
  navigation URLs.
- Current checks require nonblank name, company, and username; name up to 200
  characters; username up to 100; password at least 16; matching confirmation.
  The name, username, and password limits match the current operator provisioning
  rules. Company constraints and final signup policy remain for the backend to
  confirm.
- Username uniqueness, company creation, authorization, role assignment, and
  password hashing belong to the server. The proposed request does not accept a
  caller-supplied role. Mapping a new Head to the existing `owner` role requires
  an explicit server decision.

## Connecting the flow

Once the contract is available, replace the local reviewed state with a request
through the existing API client. Add pending, duplicate-username, field-error,
and retry states using the confirmed response contract. Remove the unavailable
notice and change the CTA to **Create account** only when the request works.

After verified authentication, use server-owned role and SOP-setup state to
route a first-time Head to initial SOP upload/review and a returning Head to the
dashboard. Route employees to assigned work. Do not infer setup completion from
local form state or create an authentication token in the browser.

## Verification checklist

- Required fields, whitespace-only names, minimum password length, and password
  confirmation show associated inline messages and focus the first invalid input.
- Both password controls toggle visibility without submitting the form.
- Valid details display the neutral registration-unavailable state.
- Editing a field clears its obsolete feedback and the reviewed status.
- Login links work and the layout remains usable at narrow viewport widths.
- Registration review produces no API call or credential persistence.
