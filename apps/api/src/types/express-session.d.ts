import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId: string;
    // Snapshot of the user's role permissions taken at login time. Edits to
    // the role_permissions table take effect on next login (not retroactively
    // for active sessions), which is the desired UX — see the
    // Roles & Permissions design notes.
    permissions: string[];
  }
}
