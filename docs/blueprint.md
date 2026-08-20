# Student Records Manager — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot for staff to manage student records (Active/Exit Exam/Graduating) and for students to view/update limited fields after account linking. All record changes trigger audit logs and admin notifications.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Educational institution staff/admins
- Enrolled students

## Success criteria

- Admins receive notifications with record diffs and links after every create/edit
- Students can securely link Telegram accounts to student IDs using one-time codes
- Persistent storage of student records with status tracking and audit history

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu based on user role
- **Create Student** (button, actor: admin, callback: create_student:start) — Initiate student record creation workflow
- **Edit Student** (button, actor: admin, callback: edit_student:start) — Search and edit existing student records
- **List by Status** (button, actor: admin, callback: list_students:start) — View students filtered by Active/Exit Exam/Graduating status
- **Link Account** (button, actor: student, callback: link_account:start) — Begin account linking process with student ID and verification code
- **View My Record** (button, actor: student, callback: view_record:start) — Display student's own record with limited fields
- **Update Contact Info** (button, actor: student, callback: update_contact:start) — Modify contact information and preferred communication method

## Flows

### Admin Authentication
_Trigger:_ /start

1. Detect admin by chat ID
2. Show admin menu with create/edit options

_Data touched:_ TelegramUserMapping

### Student Account Linking
_Trigger:_ link_account:start

1. Request student ID
2. Generate one-time code
3. Verify code entry
4. Store verified mapping

_Data touched:_ TelegramUserMapping

### Record Creation
_Trigger:_ create_student:start

1. Collect student ID/name/program
2. Set initial status
3. Capture enrollment dates
4. Save and notify admin

_Data touched:_ StudentRecord, ChangeLog

### Record Update
_Trigger:_ edit_student:start

1. Search student
2. Display editable fields
3. Collect changes
4. Save with audit entry
5. Notify admin

_Data touched:_ StudentRecord, ChangeLog

### Student Self-Update
_Trigger:_ update_contact:start

1. Verify linked account
2. Collect new contact info
3. Save changes with audit
4. Trigger admin notification

_Data touched:_ StudentRecord, ChangeLog

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Receives record change notifications with diffs
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **StudentRecord** _(retention: persistent)_ — Core student data with status tracking
  - fields: student_id, name, status, contact_info, program, enrollment_dates, exam_results, graduation_clearance, notes, created_at, updated_at
- **TelegramUserMapping** _(retention: persistent)_ — Telegram account ↔ student ID relationships
  - fields: telegram_id, student_id, verified, linked_at
- **ChangeLog** _(retention: persistent)_ — Audit trail of record modifications
  - fields: record_id, changed_by, change_type, old_values, new_values, timestamp

## Integrations

- **Telegram** (required) — Bot API messaging and admin notifications
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- ADMIN_CHAT_ID configuration for notifications
- Admin user list management via chat IDs
- Status category definitions (Active/Exit Exam/Graduating)

## Notifications

- Admin chat receives alerts on record creation/updates with field diffs and record links

## Permissions & privacy

- Student records only accessible to admins and the linked student
- Contact info updates require admin approval notification
- All data changes are logged with timestamps and responsible parties

## Edge cases

- Student enters invalid verification code
- Admin tries to edit non-existent student ID
- Unverified user attempts restricted actions
- Concurrent updates to same record

## Required tests

- Admin receives notification after student record creation
- Student can successfully link account with valid code
- Audit log captures all field changes with timestamps
- Unlinked student cannot view full records

## Assumptions

- Verification code is manually stored by admins in student records
- Status categories won't need expansion beyond the three types
- Students will only need to update contact information
