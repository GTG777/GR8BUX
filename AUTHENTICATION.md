# Authentication System Documentation

## Overview

The Trading Journal app uses **Supabase Authentication** with role-based access control (RBAC). Users can sign up, sign in, and are assigned roles: **Admin**, **Manager**, or **User**.

---

## Architecture

### Authentication Flow

```
Sign Up → Email Verification → Database Profile Created (User Role) → Dashboard
Sign In → Session Token → Load User Profile & Role → Protected Routes
```

### User Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full access, manage users, change roles, view all trades |
| **Manager** | Edit their own trades, view analytics, limited user management |
| **User** | Create and manage own trades only |

---

## Key Files

### 1. Auth Service (`/src/lib/auth.ts`)
- **Purpose**: Supabase authentication functions
- **Key Functions**:
  - `signUp()` - Register new user
  - `signIn()` - Authenticate user
  - `signOut()` - End session
  - `getCurrentUser()` - Fetch current user with role
  - `updateUserRole()` - Change user role (admin only)
  - `requestPasswordReset()` - Initiate password reset
  - `verifyEmail()` - Verify email address

### 2. Auth Store (`/src/store/authStore.ts`)
- **Purpose**: Zustand state management for auth
- **State**:
  - `user` - Current authenticated user
  - `isLoading` - Loading state
  - `isAuthenticated` - Authentication status
  - `error` - Error messages
- **Actions**:
  - `initializeAuth()` - Check session on app load
  - `handleSignUp()` - Sign up handler
  - `handleSignIn()` - Sign in handler
  - `handleSignOut()` - Sign out handler
  - `updateRole()` - Manage roles
- **Checks**:
  - `canAccess(roles)` - Check if user has required role
  - `isAdmin()` - Check if user is admin
  - `isManager()` - Check if user is manager/admin

### 3. Auth Provider (`/src/components/AuthProvider.tsx`)
- **Purpose**: Wraps app and initializes auth
- **Features**:
  - Loads user session on mount
  - Shows loading state during auth check
  - Manages auth context availability

### 4. Protected Routes (`/src/components/ProtectedRoute.tsx`)
- **Purpose**: Client-side route protection
- **Features**:
  - Redirects to login if not authenticated
  - Restricts access by role
  - Shows access denied message
- **Hooks**:
  - `useCanAccess(roles)` - Check role access
  - `useIsAdmin()` - Is user admin?
  - `useIsManager()` - Is user manager/admin?

---

## User Interface

### Sign Up Page (`/auth/signup`)
- Create new account with email
- Password validation (min 6 characters)
- Display name required
- Auto-assign "User" role
- Link to sign in page

### Sign In Page (`/auth/signin`)
- Email and password login
- Show/hide password toggle
- Forgot password link (future)
- Link to sign up page
- Auto-redirect to dashboard if authenticated

### Admin Panel (`/admin`)
- View all users with roles
- Change user roles
- See email verification status
- View last sign-in time
- Admin-only access

---

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  role VARCHAR(20) DEFAULT 'user' -- 'admin', 'manager', 'user'
  email_verified BOOLEAN DEFAULT FALSE,
  last_sign_in TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Auth Logs Table (Audit Trail)
```sql
CREATE TABLE auth_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  email TEXT NOT NULL,
  event_type VARCHAR(50), -- 'sign_up', 'sign_in', 'sign_out', 'role_changed'
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP
);
```

---

## API Reference

### Authentication Endpoints

#### 1. Get Current User
**GET** `/api/auth/user`

**Headers:**
```
Authorization: Bearer <supabase_jwt_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "email": "user@example.com",
    "role": "user",
    "emailVerified": false,
    "lastSignIn": "2026-03-24T10:00:00Z",
    "createdAt": "2026-03-20T10:00:00Z",
    "updatedAt": "2026-03-20T10:00:00Z"
  }
}
```

### Admin Endpoints

#### 1. Get All Users
**GET** `/api/admin/users`

**Headers:**
```
Authorization: Bearer <admin_jwt_token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "user-uuid",
      "email": "user@example.com",
      "displayName": "John Trader",
      "role": "user",
      "emailVerified": false,
      "createdAt": "2026-03-20T10:00:00Z",
      "lastSignIn": "2026-03-24T10:00:00Z"
    }
  ]
}
```

#### 2. Update User Role
**PUT** `/api/admin/users/:id`

**Headers:**
```
Authorization: Bearer <admin_jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "role": "manager"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "email": "user@example.com",
    "role": "manager",
    "emailVerified": false,
    "createdAt": "2026-03-20T10:00:00Z",
    "updatedAt": "2026-03-24T10:00:00Z"
  }
}
```

---

## Frontend Implementation

### Using Auth Store in Components

```typescript
import { useAuthStore } from '@/store/authStore';

export function MyComponent() {
  const { user, isAuthenticated, handleSignOut, isAdmin } = useAuthStore();

  if (!isAuthenticated) {
    return <Redirect to="/auth/signin" />;
  }

  return (
    <div>
      <p>Welcome, {user?.email}</p>
      {isAdmin() && <Link href="/admin">Admin Panel</Link>}
      <button onClick={handleSignOut}>Sign Out</button>
    </div>
  );
}
```

### Protecting Routes

```typescript
import { ProtectedRoute } from '@/components/ProtectedRoute';

export default function AdminPage() {
  return (
    <ProtectedRoute requiredRoles={['admin']}>
      {/* Admin content here */}
    </ProtectedRoute>
  );
}
```

### Checking Permissions

```typescript
import { useCanAccess, useIsAdmin } from '@/components/ProtectedRoute';

export function MyComponent() {
  const canAccess = useCanAccess(['admin', 'manager']);
  const isAdmin = useIsAdmin();

  if (!canAccess) {
    return <p>You don't have permission</p>;
  }

  return <div>{/* Protected content */}</div>;
}
```

---

## Sign Up Flow

1. User visits `/auth/signup`
2. Enters email, password, display name
3. Validation checks (password length, email format, etc.)
4. Click "Sign Up" button
5. **Supabase Auth** creates user account
6. **Database** creates user profile with role: "user"
7. **AuthStore** updates state
8. Auto-redirect to `/dashboard`
9. (Future) Send verification email

---

## Sign In Flow

1. User visits `/auth/signin`
2. Enters email and password
3. Click "Sign In" button
4. **Supabase Auth** validates credentials
5. **Database** fetches user profile and role
6. **Auth Log** records sign-in event
7. **AuthStore** updates state with user data
8. Auto-redirect to `/dashboard`

---

## Admin Panel Features

### View Users
- Email address
- Display name
- Current role (color-coded)
- Email verification status
- Last sign-in date

### Manage Roles
1. Click "Change Role" button on user
2. Select new role from dropdown
3. Click "Update Role"
4. Confirmation message appears
5. Auth log records role change

---

## Session Management

### Session Persistence
- Supabase automatically manages sessions
- JWT token stored in browser storage
- Token automatically refreshed when expired
- `AuthProvider` checks session on app load

### Session Cleanup
- Sign out removes JWT token
- User state cleared
- Redirect to login page
- Auth log records sign-out event

---

## Security Features

1. **Password Hashing**: Supabase handles bcrypt hashing
2. **JWT Tokens**: Secure stateless authentication
3. **Email Verification**: Optional (future implementation)
4. **Role-Based Access**: Enforced at API level
5. **Audit Logging**: All auth events tracked
6. **CORS Protection**: Supabase handles cross-origin security
7. **SQL Injection Prevention**: Supabase parameterized queries

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Invalid email or password" | Wrong credentials | Check email/password |
| "Email already exists" | Duplicate signup | Use different email |
| "Password too weak" | <6 characters | Use longer password |
| "Invalid or expired token" | Session expired | Sign in again |
| "Admin access required" | Insufficient permissions | Check user role |

---

## Future Enhancements

- [ ] Email verification requirement
- [ ] Password reset flow
- [ ] Social login (Google, GitHub)
- [ ] Two-factor authentication (2FA)
- [ ] Invite-only signup
- [ ] Extended profile fields
- [ ] OAuth2 integrations
- [ ] Account deletion
- [ ] Session management dashboard

---

## Testing Authentication

### Manual Testing Steps

1. **Sign Up**
   ```bash
   Visit http://localhost:3000/auth/signup
   Create account with new email
   Verify redirect to dashboard
   ```

2. **Sign In**
   ```bash
   Visit http://localhost:3000/auth/signin
   Use credentials from signup
   Verify redirect to dashboard
   ```

3. **Admin Panel**
   ```bash
   Sign in as admin user
   Visit http://localhost:3000/admin
   Try changing user role
   ```

4. **Protected Routes**
   ```bash
   Sign out
   Try accessing /dashboard
   Verify redirect to signin
   ```

---

## Environment Variables Required

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

These are already set in `.env.local`

---

## Quick Reference

### Sign Up & Sign In
```typescript
const { handleSignUp, handleSignIn } = useAuthStore();

// Sign up
await handleSignUp({
  email: 'user@example.com',
  password: 'secure_password',
  displayName: 'John Trader'
});

// Sign in
await handleSignIn({
  email: 'user@example.com',
  password: 'secure_password'
});
```

### Check Permissions
```typescript
const { user, canAccess, isAdmin } = useAuthStore();

if (isAdmin()) {
  // Admin-only code
}

if (canAccess(['manager', 'admin'])) {
  // Manager or admin code
}
```

### Sign Out
```typescript
const { handleSignOut } = useAuthStore();
await handleSignOut();
```
