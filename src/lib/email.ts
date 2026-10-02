import "server-only";

import { Resend } from "resend";

/**
 * Same shape as crewupapp's src/lib/email.ts (sendEmail + emailShell +
 * per-notification template functions). Hardcoded, exactly like crewupapp
 * hardcodes its own — an email client fetches this image from the
 * recipient's inbox, not from this server, so a value built from
 * NEXT_PUBLIC_APP_URL (which is "http://localhost:3000" in local dev)
 * would render a broken image in a real inbox the moment the email was
 * sent from a dev machine, the same failure mode crewupapp's own code
 * comment describes hitting before it hardcoded its URL. GovConUnited's
 * confirmed production domain is https://govconunited.com.
 *
 * Path is case-sensitive on the deployed (Linux) server even though it
 * looks fine on a case-insensitive local filesystem — the real asset
 * lives at public/Logos/ (capital L, see git ls-tree), so a lowercase
 * "logos" here 404's in production even though it resolves locally.
 *
 * "Logotype" (wide single-line wordmark), not "GCU-White" (tall stacked
 * mark) — the stacked variant is nearly square, so scaling it to a small
 * header height like emailShell() uses renders illegibly narrow.
 *
 * "Black" variant deliberately used on top of a *white* pill (see below),
 * not "White" — GovCon is always rendered in full brand red/blue in both
 * variants, only the "United" portion differs (white vs. black), so on a
 * white pill backing "White" makes United invisible (white-on-white)
 * while "Black" reads correctly (black-on-white). Placing the logo
 * directly on this app's red header (no white pill) doesn't work either
 * way, since GovCon's red text always disappears against a matching red
 * background — hence the white pill around the <img> in emailShell()
 * below (same fix CrewUp's own logo header uses).
 */
const LOGO_URL = "https://govconunited.com/Logos/GCU%20Logotype%20Black.png";

/**
 * Every clickable link inside an email (View Post, View Profile,
 * Confirm your email, etc.) is built from this, not from any env-aware
 * `siteUrl`/`NEXT_PUBLIC_APP_URL` helper — an email sent while testing
 * against this shared production database from a local dev server must
 * still link to the real site, not localhost, regardless of which
 * environment happened to trigger the send. Keep any env-aware siteUrl
 * used for SEO metadata (canonical/sitemap) as a separate constant from
 * this one.
 */
export const EMAIL_SITE_URL = "https://govconunited.com";

// Hardcoded exactly like crewupapp hardcodes its own FROM constant
// (`CrewUp <noreply@crewupapp.co>`) — govconunited.com is verified in
// Resend, so this address can send without depending on an env var that
// was left blank in .env.local and silently no-op'd every send.
const FROM_ADDRESS = "GovConUnited <noreply@govconunited.com>";

// Same cross-client fallback stack as crewupapp's emailShell() — a bare
// "'Helvetica Neue'" (this file's previous value) has no fallback at all
// for clients that don't have that exact font installed (most non-Apple
// mail clients), silently falling back to serif in some of them.
const FONT_STACK = "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";

export type SendEmailResult = { ok: true } | { ok: false; error: string };

/**
 * Best-effort by design, same as crewupapp: a missing RESEND_API_KEY, or
 * a failed send, is logged and returned as a normal result, never thrown
 * — sending an email must never be able to break the action it's
 * attached to (e.g. a newsletter signup should still succeed even if the
 * confirmation email fails to send).
 */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[email] RESEND_API_KEY is not set — email not sent.");
    return { ok: false, error: "Email is not configured." };
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({ from: FROM_ADDRESS, to, subject, html });
    if (error) {
      console.error("[email] send failed:", error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email] send threw:", err);
    return { ok: false, error: "Failed to send email." };
  }
}

// crewupapp's escapeHtml() — title/body/recipientName flowing through
// notificationEmailHtml below are real user-controlled content (a
// member's own name, a post title, a message preview, a teaming-inquiry
// message), not copy this app wrote itself. This was a real gap: every
// call site interpolated that content into the email's raw HTML
// unescaped, so a name or message containing HTML/script-like characters
// would be injected verbatim into the outbound email. Applied at the one
// shared template (notificationEmailHtml) rather than at every call site,
// same as crewupapp does for its per-notification templates.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Shared HTML shell for every email — dark navy header with the
 * GovConUnited wordmark, a white content card, and a muted footer.
 * Same table-based structure as crewupapp's emailShell() (email clients,
 * especially Outlook desktop, need `<table>` layout and inline styles;
 * no external stylesheet, no flex/grid) — this keeps crewupapp's exact
 * layout/spacing/typography pattern, recolored to GovConUnited's own brand
 * red `#ed1c24` (the same red used for the site's primary CTA buttons, see
 * `--o-red`/`.nav-join`/`.btn.brand-red` in src/app/landing.css) rather than
 * crewupapp's slate, since the two are visually distinct products under
 * the same parent company, not reskins of each other.
 */
function emailShell(
  preheader: string,
  bodyHtml: string,
  footer = "You're receiving this because you opted in to GovConUnited emails. You can unsubscribe using the link in any newsletter email.",
  width = 480,
): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f3f7ff;font-family:${FONT_STACK};">
    <span style="display:none;font-size:1px;color:#f3f7ff;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f7ff;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="${width}" cellpadding="0" cellspacing="0" style="width:100%;max-width:${width}px;background-color:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background-color:#ed1c24;padding:20px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background-color:#ffffff;border-radius:8px;padding:8px 14px;">
                      <img src="${LOGO_URL}" alt="GovConUnited" height="20" style="display:block;height:20px;width:auto;border:0;" />
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#1f2937;font-size:14px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 28px;color:#9aa5b8;font-size:12px;">
                ${footer}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 32px 24px;color:#9aa5b8;font-size:11px;">
                &copy; 2026 GovConUnited, LLC. <a href="https://robbcc.com/" style="color:#9aa5b8;text-decoration:underline;">A Robb Industrial Co.</a> All rights reserved.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * One shared template for every emailed notification type (connection
 * requests/accepts, messages, event invites/reminders, billing, moderation,
 * security, jobs, teaming) rather than a bespoke template per type — a
 * pragmatic simplification; the content (title/body/link) already differs
 * per notification, so the marginal value of per-type visual templates is
 * low relative to the effort of hand-building and maintaining a dozen of
 * them. Structure (greeting, bold headline, boxed excerpt, labeled CTA)
 * matches crewupapp's communityNotificationEmailHtml() — same
 * greeting/headline/boxed-excerpt/CTA shape, and same escaping discipline
 * for the user-controlled title/body/recipientName fields.
 */
export function notificationEmailHtml({
  recipientName,
  title,
  body,
  ctaUrl,
  ctaLabel = "View on GovConUnited",
}: {
  recipientName: string;
  title: string;
  body?: string | null;
  ctaUrl: string;
  ctaLabel?: string;
}): string {
  const safeName = escapeHtml(recipientName);
  const safeTitle = escapeHtml(title);
  const safeBody = body ? escapeHtml(body) : null;
  const safeCtaLabel = escapeHtml(ctaLabel);
  return emailShell(
    safeTitle,
    `
      <p style="margin:0 0 20px;">Hi ${safeName},</p>
      <p style="margin:0 0 16px;font-weight:700;font-size:16px;">${safeTitle}</p>
      ${safeBody ? `<div style="background-color:#f3f5f9;border-radius:8px;padding:14px 16px;margin:0 0 20px;color:#374151;">${safeBody}</div>` : ""}
      <a href="${ctaUrl}" style="display:inline-block;background-color:#ed1c24;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 20px;border-radius:8px;">${safeCtaLabel}</a>
    `,
    "You're receiving this because email notifications are turned on in your GovConUnited settings. You can turn them off anytime from Settings → Notifications.",
  );
}

// Sent to a company's business_email to prove the company controls it
// (partner requirement 4). The link opens a confirm page rather than
// verifying on GET, so inbox link scanners can't consume it.
export function businessEmailVerificationHtml({ companyName, confirmUrl }: { companyName: string; confirmUrl: string }): string {
  const safeCompany = escapeHtml(companyName);
  return emailShell(
    `Verify the business email for ${safeCompany}`,
    `
      <p style="margin:0 0 16px;font-weight:700;font-size:16px;">Verify your business email</p>
      <p style="margin:0 0 20px;">An admin of <strong>${safeCompany}</strong> on GovConUnited asked to verify this address as the company's business email. The link expires in 24 hours.</p>
      <a href="${confirmUrl}" style="display:inline-block;background-color:#ed1c24;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 20px;border-radius:8px;">Verify email address</a>
    `,
    "You're receiving this because this address is listed as a company's business email on GovConUnited. If you didn't expect it, you can ignore this email.",
  );
}

export function workEmailVerificationHtml({ companyName, confirmUrl }: { companyName: string; confirmUrl: string }): string {
  const safeCompany = escapeHtml(companyName);
  return emailShell(
    `Confirm you work at ${safeCompany}`,
    `
      <p style="margin:0 0 16px;font-weight:700;font-size:16px;">Confirm your work email</p>
      <p style="margin:0 0 20px;">You asked to join <strong>${safeCompany}</strong> on GovConUnited as a verified employee. Your activity will count toward the company's monthly leaderboard. The link expires in 24 hours.</p>
      <a href="${confirmUrl}" style="display:inline-block;background-color:#ed1c24;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 20px;border-radius:8px;">Confirm work email</a>
    `,
    "You're receiving this because someone entered this address to verify their employer on GovConUnited. If it wasn't you, you can ignore this email.",
  );
}

// ---------------------------------------------------------------------------
// Network digests (LinkedIn-style "Career trends in your network" and
// "<name> and others share their thoughts"). Data is built by
// src/lib/network-digest.ts and sent by /api/cron/network-digests.
// ---------------------------------------------------------------------------

const DIGEST_FOOTER =
  "You're receiving this digest because Following notifications are turned on in your GovConUnited settings. You can turn them off anytime from Settings → Notifications.";
const DIGEST_BLUE = "#0a66c2";

export type DigestPerson = {
  name: string;
  headline: string | null;
  avatarUrl: string | null;
  profileUrl: string;
  ctaUrl: string;
  ctaLabel: string;
  note?: string | null;
};

export type DigestJob = { title: string; companyName: string; meta: string | null; url: string };

export type DigestTopCompany = {
  name: string;
  url: string;
  monthLabel: string;
  activeEmployees: number;
  score: number;
  leaderboardUrl: string;
};

export type DigestPost = {
  authorName: string;
  authorHeadline: string | null;
  avatarUrl: string | null;
  authorUrl: string;
  excerpt: string;
  imageUrl: string | null;
  reactions: number;
  comments: number;
  postUrl: string;
};

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}

// Email clients can't render CSS-only avatars reliably, so the fallback is
// a fixed-size table cell with the member's initials.
function digestAvatar(name: string, url: string | null, size: number): string {
  if (url) {
    return `<img src="${escapeHtml(url)}" alt="" width="${size}" height="${size}" style="display:block;width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:0;" />`;
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" valign="middle" width="${size}" height="${size}" style="width:${size}px;height:${size}px;border-radius:50%;background-color:${DIGEST_BLUE};color:#ffffff;font-weight:700;font-size:${Math.round(size / 2.6)}px;">${escapeHtml(initialsOf(name))}</td></tr></table>`;
}

function pillButton(url: string, label: string, filled = false): string {
  const colors = filled
    ? `background-color:${DIGEST_BLUE};color:#ffffff;border:1px solid ${DIGEST_BLUE};`
    : `background-color:#ffffff;color:${DIGEST_BLUE};border:1px solid ${DIGEST_BLUE};`;
  return `<a href="${escapeHtml(url)}" style="display:inline-block;${colors}text-decoration:none;font-weight:600;font-size:14px;padding:8px 18px;border-radius:999px;white-space:nowrap;">${escapeHtml(label)}</a>`;
}

function personRow(p: DigestPerson): string {
  return `
    <tr>
      <td width="56" valign="top" style="padding:10px 12px 10px 0;width:56px;"><a href="${escapeHtml(p.profileUrl)}" style="text-decoration:none;">${digestAvatar(p.name, p.avatarUrl, 48)}</a></td>
      <td valign="top" style="padding:10px 0;">
        <a href="${escapeHtml(p.profileUrl)}" style="color:#111827;text-decoration:none;font-weight:700;font-size:15px;">${escapeHtml(p.name)}</a>
        ${p.headline ? `<div style="color:#4b5563;font-size:13px;line-height:1.4;">${escapeHtml(p.headline)}</div>` : ""}
        ${p.note ? `<div style="color:#6b7280;font-size:12px;margin-top:2px;">${escapeHtml(p.note)}</div>` : ""}
      </td>
      <td width="1" valign="top" align="right" style="padding:10px 0 10px 12px;">${pillButton(p.ctaUrl, p.ctaLabel)}</td>
    </tr>`;
}

function digestSection(title: string, subtitle: string, rows: DigestPerson[], moreUrl?: string): string {
  if (rows.length === 0) return "";
  return `
    <div style="margin:28px 0 0;">
      <p style="margin:0;font-weight:700;font-size:18px;color:#111827;">${escapeHtml(title)}</p>
      <p style="margin:2px 0 6px;color:#374151;">${escapeHtml(subtitle)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.map(personRow).join("")}</table>
      ${moreUrl ? `<p style="margin:8px 0 0;"><a href="${escapeHtml(moreUrl)}" style="color:#374151;font-weight:700;text-decoration:none;">See more &rarr;</a></p>` : ""}
    </div>`;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function weeklyTrendsEmailHtml(d: {
  teamingCount: number;
  teamingUrl: string;
  services: DigestPerson[];
  servicesMoreUrl?: string;
  milestones: DigestPerson[];
  milestoneCount: number;
  jobs: DigestJob[];
  jobsMoreUrl: string;
  topCompany?: DigestTopCompany | null;
}): string {
  const hero =
    d.teamingCount > 0
      ? `
      <p style="margin:18px 0 0;font-size:56px;line-height:1;color:#111827;">${d.teamingCount}</p>
      <p style="margin:10px 0 16px;color:#111827;">${plural(d.teamingCount, "Person", "People")} <strong>open to teaming</strong> in your network this week</p>
      ${pillButton(d.teamingUrl, "See all open to teaming", true)}`
      : "";
  const jobs =
    d.jobs.length > 0
      ? `
    <div style="margin:28px 0 0;">
      <p style="margin:0;font-weight:700;font-size:18px;color:#111827;">New jobs from companies you follow</p>
      <p style="margin:2px 0 6px;color:#374151;">Posted in the last week</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${d.jobs
          .map(
            (j) => `
          <tr>
            <td valign="top" style="padding:10px 0;border-bottom:1px solid #eef0f4;">
              <a href="${escapeHtml(j.url)}" style="color:${DIGEST_BLUE};text-decoration:none;font-weight:700;font-size:15px;">${escapeHtml(j.title)}</a>
              <div style="color:#4b5563;font-size:13px;">${escapeHtml(j.companyName)}${j.meta ? ` · ${escapeHtml(j.meta)}` : ""}</div>
            </td>
            <td width="1" valign="top" align="right" style="padding:10px 0 10px 12px;border-bottom:1px solid #eef0f4;">${pillButton(j.url, "View")}</td>
          </tr>`,
          )
          .join("")}
      </table>
      <p style="margin:8px 0 0;"><a href="${escapeHtml(d.jobsMoreUrl)}" style="color:#374151;font-weight:700;text-decoration:none;">See all jobs &rarr;</a></p>
    </div>`
      : "";
  const top = d.topCompany
    ? `
    <div style="margin:28px 0 0;padding:16px;border:1px solid #f5d77a;border-radius:10px;background:#fffaf0;">
      <p style="margin:0;font-weight:700;font-size:18px;color:#111827;">&#127942; Top Company of ${escapeHtml(d.topCompany.monthLabel)}</p>
      <p style="margin:6px 0 12px;color:#374151;"><a href="${escapeHtml(d.topCompany.url)}" style="color:${DIGEST_BLUE};text-decoration:none;font-weight:700;">${escapeHtml(d.topCompany.name)}</a> led the company leaderboard: ${d.topCompany.activeEmployees} active ${plural(d.topCompany.activeEmployees, "employee", "employees")} averaging ${d.topCompany.score.toLocaleString("en-US")} XP a week.</p>
      ${pillButton(d.topCompany.leaderboardUrl, "See the company leaderboard")}
    </div>`
    : "";

  return emailShell(
    "Career trends in your network this past week",
    `
      <p style="margin:0;font-weight:700;font-size:24px;line-height:1.25;color:#111827;">Career trends in your network this past week</p>
      ${hero}
      ${digestSection("Offering professional services", "See what they're offering", d.services, d.servicesMoreUrl)}
      ${digestSection(
        "Career milestones",
        `${d.milestoneCount} ${plural(d.milestoneCount, "person is", "people are")} celebrating a work anniversary this month`,
        d.milestones,
      )}
      ${jobs}
      ${top}
    `,
    DIGEST_FOOTER,
    560,
  );
}

export function topPostsEmailHtml(d: { posts: DigestPost[]; feedUrl: string }): string {
  const first = d.posts[0]?.authorName ?? "Your network";
  const cards = d.posts
    .map(
      (p) => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;margin:0 0 16px;">
        <tr>
          <td style="padding:16px 16px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="52" valign="top" style="width:52px;padding-right:10px;"><a href="${escapeHtml(p.authorUrl)}" style="text-decoration:none;">${digestAvatar(p.authorName, p.avatarUrl, 42)}</a></td>
                <td valign="top">
                  <a href="${escapeHtml(p.authorUrl)}" style="color:#111827;text-decoration:none;font-weight:700;font-size:14px;">${escapeHtml(p.authorName)}</a>
                  ${p.authorHeadline ? `<div style="color:#6b7280;font-size:12px;line-height:1.4;">${escapeHtml(p.authorHeadline)}</div>` : ""}
                </td>
              </tr>
            </table>
            <p style="margin:12px 0 8px;color:#1f2937;font-size:14px;line-height:1.5;">${escapeHtml(p.excerpt)} <a href="${escapeHtml(p.postUrl)}" style="color:${DIGEST_BLUE};text-decoration:none;font-weight:600;">see more</a></p>
            <p style="margin:0 0 12px;color:#6b7280;font-size:12px;">${p.reactions} ${plural(p.reactions, "reaction", "reactions")} · ${p.comments} ${plural(p.comments, "comment", "comments")}</p>
          </td>
        </tr>
        ${
          p.imageUrl
            ? `<tr><td><a href="${escapeHtml(p.postUrl)}"><img src="${escapeHtml(p.imageUrl)}" alt="" width="494" style="display:block;width:100%;max-width:100%;height:auto;border:0;" /></a></td></tr>`
            : ""
        }
        <tr>
          <td align="center" style="padding:14px 16px 16px;">
            <a href="${escapeHtml(p.postUrl)}" style="display:block;border:1px solid ${DIGEST_BLUE};color:${DIGEST_BLUE};text-decoration:none;font-weight:600;font-size:14px;padding:9px 0;border-radius:999px;">Read more</a>
          </td>
        </tr>
      </table>`,
    )
    .join("");

  return emailShell(
    `${escapeHtml(first)} and others share their thoughts on GovConUnited`,
    `
      ${cards}
      <p style="margin:8px 0 0;text-align:center;">${pillButton(d.feedUrl, "See more on GovConUnited", true)}</p>
    `,
    DIGEST_FOOTER,
    560,
  );
}
