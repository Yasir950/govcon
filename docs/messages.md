# Messages

Real direct-messaging inbox (`/messages`) — the mockup's "Messages" nav
item and topbar icon previously had nowhere real to go; this is a genuine
implementation, not a "coming soon" stub.

## Files

| File | Role |
| --- | --- |
| `supabase/migrations/20260918000100_messaging.sql` | `conversations` (always exactly two `profiles` participants, normalized-pair uniqueness via a `least`/`greatest` index) and `messages` tables, with RLS restricting every read/write to the two participants. A trigger keeps `conversations.last_message_at` current for inbox sorting. |
| `src/app/messages/page.tsx` | Server component. Requires auth. Resolves `?to=<memberId>` (start/find a conversation) or `?c=<conversationId>` (open one), marks it read, and fetches the conversation list + thread. |
| `src/app/messages/actions.ts` | `getOrCreateConversationId`, `sendMessageAction`, `markConversationReadAction` — real Server Actions, all RLS-scoped to the caller. |
| `src/components/messages/MessagesPageClient.tsx` | Client component: conversation list + message thread, optimistic send. |
| `src/lib/supabase/queries.ts` → `getConversations()`, `getUnreadMessageCount()`, `getMessages()` | Real data fetchers. |
| `src/app/api/messages/unread-count/route.ts` | Backs the shell's Messages badge (see [dashboard.md](./dashboard.md)). |

## How a conversation starts

Two real entry points, both landing on the same `?to=<memberId>` →
resolve → `?c=<id>` flow:

- `ConnectButton`'s "Message" button (used on `/network` and member profile
  pages) navigates to `/messages?to=<memberId>`.
- The **"New Message"** button on `/messages` itself opens a people-picker
  modal (search-filtered against real `network_members`, excluding the
  viewer and anyone already in the conversation list) — selecting someone
  navigates the same way.

Either way, the page resolves `?to=` into a real conversation (creating one
if none exists yet, via `getOrCreateConversationId`) and redirects to the
normal `/messages?c=<id>` URL.

## What's real vs. what was simplified

- **Sending, reading, unread counts** — all real and persisted. A message
  insert fires a database trigger that updates `last_message_at`; unread
  counts come from `read_at is null` rows the viewer didn't send.
- **No realtime** — a new message from the other participant doesn't appear
  until the page is refreshed or a `sendMessageAction` call triggers
  `revalidatePath("/messages")`. Supabase Realtime could add live push
  later; this pass is a real, persisted, refresh-based inbox, not a fake
  one — realtime is a separate, larger addition.
- **No group conversations** — `conversations` is structurally two-party
  only (`member_one_id`/`member_two_id`), matching the mockup's own 1:1
  message-drawer design.

## Known gaps

- No realtime delivery (see above).
- No message editing/deletion, read receipts beyond the unread count, or
  typing indicators.
