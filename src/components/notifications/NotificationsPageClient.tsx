"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getNotificationsAction, markAllNotificationsReadAction, markNotificationReadAction } from "@/app/(app)/notifications/actions";
import { Avatar } from "@/components/avatar";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import type { NotificationItem } from "@/lib/supabase/queries";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.round(diffMs / (1000 * 60)));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.round(days / 7);
  return `${weeks}w`;
}

const FILTERS = ["all", "jobs", "opportunities", "posts", "mentions", "rewards"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  jobs: "Jobs",
  opportunities: "Opportunities",
  posts: "Posts",
  mentions: "Mentions",
  rewards: "Rewards",
};

// Own domain equivalent of LinkedIn's All/Jobs/My posts/Mentions tabs —
// mapped from this app's actual notification types (see CATEGORY_BY_TYPE
// in src/lib/notifications.ts) rather than reusing LinkedIn's categories
// verbatim, since e.g. "connections"/"billing" have no LinkedIn analogue.
// opportunity_alert has its own "Opportunities" tab rather than being
// folded into Jobs — a different notice type on this platform.
const JOB_TYPES = new Set(["job_application_received", "application_status_changed", "company_job_posted"]);
const OPPORTUNITY_TYPES = new Set(["opportunity_alert", "company_opportunity_posted"]);
const POST_TYPES = new Set([
  "post_liked",
  "post_commented",
  "post_reposted",
  "community_post_created",
  "post_answer_accepted",
  "network_post_created",
  "network_comment_created",
  "followed_post_commented",
  "company_post_created",
]);
const MENTION_TYPES = new Set(["mention", "comment_reply"]);

function categoryOf(type: string): Filter | null {
  if (JOB_TYPES.has(type)) return "jobs";
  if (OPPORTUNITY_TYPES.has(type)) return "opportunities";
  if (POST_TYPES.has(type)) return "posts";
  if (MENTION_TYPES.has(type)) return "mentions";
  if (type.startsWith("rewards_")) return "rewards";
  return null;
}

export function NotificationsPageClient({
  notifications,
  profileCard,
}: {
  notifications: NotificationItem[];
  profileCard: ReactNode;
}) {
  const [items, setItems] = useState(notifications);
  const [filter, setFilter] = useState<Filter>("all");
  const unreadCount = items.filter((n) => !n.readAt).length;

  function notifyBadge(count: number) {
    window.dispatchEvent(new CustomEvent("gcu:notifications-changed", { detail: { count } }));
  }

  // Live updates while this page is open — a new notification lands in
  // the list without needing a refresh. Refetches the full list rather
  // than constructing a row from the raw payload since that only carries
  // actor_id, not the resolved actor name/avatar getNotifications joins in.
  useEffect(() => {
    let cancelled = false;
    const supabase = createBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled || !data.session) return;
      supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`notifications-page-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload) => {
          const row = payload.new as { type: string };
          if (row.type === "connection_request") return;
          getNotificationsAction().then((fresh) => {
            if (cancelled) return;
            setItems(fresh);
            notifyBadge(fresh.filter((n) => !n.readAt).length);
          });
        })
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const countByFilter = useMemo(() => {
    const counts: Record<Filter, number> = { all: items.length, jobs: 0, opportunities: 0, posts: 0, mentions: 0, rewards: 0 };
    for (const n of items) {
      const cat = categoryOf(n.type);
      if (cat) counts[cat]++;
    }
    return counts;
  }, [items]);

  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((n) => categoryOf(n.type) === filter)),
    [items, filter],
  );

  async function markRead(id: string) {
    setItems((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
      notifyBadge(next.filter((n) => !n.readAt).length);
      return next;
    });
    await markNotificationReadAction(id);
  }

  async function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    notifyBadge(0);
    await markAllNotificationsReadAction();
  }

  return (
    <section className="main" id="notifications-page">
      <div className="wrap">
        <div className="opps-app compact-btns">
          <div className="notif-layout">
            <aside className="notif-rail">
              {profileCard}

              <section className="card panel notif-manage-card">
                <strong>Manage your notifications</strong>
                <Link href="/settings/notifications" className="link-btn">
                  View settings
                </Link>
              </section>
            </aside>

            <div className="notif-main">
              <div className="notif-filters">
                {FILTERS.map((f) => (
                  <button key={f} className={`filter-pill${filter === f ? " active" : ""}`} onClick={() => setFilter(f)}>
                    {FILTER_LABEL[f]}
                    {f !== "all" && countByFilter[f] > 0 ? ` (${countByFilter[f]})` : ""}
                  </button>
                ))}
                {unreadCount > 0 && (
                  <button className="btn btn-outline btn-sm" style={{ marginLeft: "auto" }} onClick={markAllRead}>
                    Mark all as read
                  </button>
                )}
              </div>

              {visible.length === 0 ? (
                <section className="card empty">
                  <strong>{items.length === 0 ? "No notifications yet" : "Nothing here"}</strong>
                  {items.length === 0
                    ? "Activity on your posts, connections, and account will show up here."
                    : "Try a different filter."}
                </section>
              ) : (
                <div className="card panel notif-list">
                  {visible.map((n) => (
                    <Link
                      href={`/${n.linkPath}`}
                      key={n.id}
                      className={`notif-row${n.readAt ? "" : " notif-row-unread"}`}
                      onClick={() => !n.readAt && markRead(n.id)}
                    >
                      {!n.readAt && <span className="notif-dot" aria-hidden="true" />}
                      <Avatar name={n.actorName || "GovConUnited"} avatarUrl={n.actorAvatarUrl} size={44} />
                      <span className="notif-row-body">
                        <span className="notif-row-title">{n.title}</span>
                        {n.body && <span className="notif-row-text">{n.body}</span>}
                        <span className="meta">{timeAgo(n.createdAt)} ago</span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
