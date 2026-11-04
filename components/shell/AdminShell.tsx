"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import {
  LayoutDashboard,
  ClipboardList,
  Wrench,
  Boxes,
  Send,
  Truck,
  Users,
  CalendarCheck,
  Banknote,
  Wallet,
  Package,
  Building2,
  Contact,
  FileText,
  Inbox,
  MessageCircle,
  Megaphone,
  BellRing,
  Globe,
  BarChart3,
  ScrollText,
  Settings,
  LogOut,
  Search,
  Bell,
  ChevronsLeft,
  ChevronsRight,
  Menu,
  X,
} from "lucide-react";
import { hasSupabaseEnv, getSupabase } from "@hericilla/supabase-clients";
import { useUnseenCount } from "@hericilla/push-web";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";

type NavItem = { href: string; label: string; icon: ReactNode; hint: string };

/** Grouped navigation — every destination appears exactly once (the old "More" page is gone). */
export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5" />, hint: "Your day at a glance" },
    ],
  },
  {
    title: "Jobs & Delivery",
    items: [
      { href: "/jobs", label: "Jobs", icon: <ClipboardList className="h-5 w-5" />, hint: "Service requests" },
      { href: "/work-orders", label: "Work orders", icon: <Wrench className="h-5 w-5" />, hint: "Approved jobs with WO numbers" },
      { href: "/packing", label: "Packing & Removal", icon: <Boxes className="h-5 w-5" />, hint: "Move jobs and handovers" },
      { href: "/deliveries", label: "Deliveries", icon: <Send className="h-5 w-5" />, hint: "Proof of delivery and trip costs" },
      { href: "/vehicles", label: "Vehicles", icon: <Truck className="h-5 w-5" />, hint: "Fleet, allocations and movements" },
    ],
  },
  {
    title: "People",
    items: [
      { href: "/people", label: "Staff", icon: <Users className="h-5 w-5" />, hint: "Employee register, roles and licences" },
      { href: "/attendance", label: "Attendance", icon: <CalendarCheck className="h-5 w-5" />, hint: "Who clocked in, exceptions and corrections" },
      { href: "/payroll", label: "Payroll", icon: <Banknote className="h-5 w-5" />, hint: "Salary runs and payslips" },
    ],
  },
  {
    title: "Finance & Stock",
    items: [
      { href: "/money", label: "Finance & Billing", icon: <Wallet className="h-5 w-5" />, hint: "Invoices, expenses and payments" },
      { href: "/procurement", label: "Procurement", icon: <Package className="h-5 w-5" />, hint: "Requests, approvals and orders" },
      { href: "/inventory", label: "Inventory", icon: <Boxes className="h-5 w-5" />, hint: "Stock in, stock out, reorder alerts" },
    ],
  },
  {
    title: "Contacts & Documents",
    items: [
      { href: "/clients", label: "Clients", icon: <Building2 className="h-5 w-5" />, hint: "Companies we serve" },
      { href: "/suppliers", label: "Suppliers", icon: <Contact className="h-5 w-5" />, hint: "Who we buy from" },
      { href: "/documents", label: "Contracts & Documents", icon: <FileText className="h-5 w-5" />, hint: "Every file with expiry reminders" },
    ],
  },
  {
    title: "Communication",
    items: [
      { href: "/inbox", label: "Enquiries", icon: <Inbox className="h-5 w-5" />, hint: "Website enquiries awaiting action" },
      { href: "/inbox/chat", label: "Live chat", icon: <MessageCircle className="h-5 w-5" />, hint: "Conversations from the website" },
      { href: "/inbox/announcements", label: "Announcements", icon: <Megaphone className="h-5 w-5" />, hint: "Broadcasts to staff" },
      { href: "/notifications", label: "Notifications", icon: <BellRing className="h-5 w-5" />, hint: "Everything sent to you" },
    ],
  },
  {
    title: "Insights & Admin",
    items: [
      { href: "/cms", label: "Website CMS", icon: <Globe className="h-5 w-5" />, hint: "Blog, testimonials, careers and page text" },
      { href: "/reports", label: "Reports", icon: <BarChart3 className="h-5 w-5" />, hint: "The eight report families" },
      { href: "/audit", label: "Audit Log", icon: <ScrollText className="h-5 w-5" />, hint: "Who changed what and when" },
      { href: "/settings", label: "Settings", icon: <Settings className="h-5 w-5" />, hint: "Roles, rules and reminders" },
    ],
  },
];

const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** Flat destination list powering the "Find anything" search — derived so it never drifts from the nav. */
export const ALL_DESTINATIONS: { href: string; label: string; description: string }[] = NAV_ITEMS.map((n) => ({
  href: n.href,
  label: n.label,
  description: n.hint,
}));

/** The four most-used screens for the mobile bottom bar; the rest live in the Menu drawer. */
const MOBILE_PRIMARY_HREFS = ["/dashboard", "/jobs", "/inbox", "/money"];
const MOBILE_PRIMARY: NavItem[] = MOBILE_PRIMARY_HREFS.map(
  (href) => NAV_ITEMS.find((n) => n.href === href) ?? NAV_ITEMS[0],
);

/** Sidebar collapse state, remembered per browser. Read after mount so the
    server-rendered markup always matches the first client render (no hydration drift). */
function useSidebarCollapse(storageKey: string) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(storageKey) === "collapsed");
    } catch {
      /* storage unavailable — stay expanded */
    }
  }, [storageKey]);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(storageKey, next ? "collapsed" : "expanded");
    } catch {
      /* ignore */
    }
  };
  return { collapsed, toggle };
}

/** The single nav item that best matches the current path (longest prefix wins, so /inbox/chat
    highlights "Live chat" and not also "Enquiries"). */
function useActiveHref(pathname: string): string {
  return useMemo(() => {
    let best = "";
    for (const n of NAV_ITEMS) {
      if (pathname === n.href || pathname.startsWith(n.href + "/")) {
        if (n.href.length > best.length) best = n.href;
      }
    }
    return best;
  }, [pathname]);
}

function GroupedNav({
  collapsed,
  activeHref,
  onNavigate,
}: {
  collapsed?: boolean;
  activeHref: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2" aria-label="Main">
      {NAV_GROUPS.map((group) => (
        <div key={group.title}>
          {!collapsed && (
            <p className="px-4 pb-1 text-xs font-bold uppercase tracking-wider text-brand-300/80">{group.title}</p>
          )}
          <div className="space-y-1">
            {group.items.map((n) => {
              const active = n.href === activeHref;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  title={collapsed ? n.label : n.hint}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center rounded-xl py-2.5 text-base font-semibold transition ${
                    collapsed ? "justify-center px-2" : "gap-3 px-4"
                  } ${active ? "bg-white text-brand-950 shadow-sm" : "text-brand-100 hover:bg-brand-900 hover:text-white"}`}
                >
                  {active && !collapsed && <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-brand-600" />}
                  <span className={active ? "text-brand-700" : "text-brand-200"}>{n.icon}</span>
                  {!collapsed && n.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const { profile, signOut } = useAuth();
  const [query, setQuery] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const { collapsed, toggle } = useSidebarCollapse("hericilla-admin-sidebar");
  const unseen = useUnseenCount(profile?.id ?? null, profile?.role ?? null);
  const activeHref = useActiveHref(pathname);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // ── Notification popover data (last 14 days unread) ──────────────────────────
  const { data: notifItems } = useQuery({
    queryKey: ["notif-popover", profile?.id],
    queryFn: async () => {
      const twoWeeksAgo = new Date(Date.now() - 14 * 86400_000).toISOString();
      const { data: rows } = await getSupabase()
        .from("hericilla_notification_outbox")
        .select("id,title,body,created_at,data")
        .or(`recipient_user_id.eq.${profile?.id},role_target.eq.${profile?.role}`)
        .gte("created_at", twoWeeksAgo)
        .order("created_at", { ascending: false })
        .limit(30);
      const list = (rows as { id: string; title: string; body: string; created_at: string; data: Record<string, string> }[]) ?? [];
      if (list.length === 0) return [];
      const { data: seenRows } = await getSupabase()
        .from("hericilla_notifications_seen")
        .select("outbox_id")
        .eq("user_id", profile!.id)
        .in("outbox_id", list.map((r) => r.id));
      const seenSet = new Set(((seenRows as { outbox_id: string }[]) ?? []).map((s) => s.outbox_id));
      return list.filter((r) => !seenSet.has(r.id));
    },
    enabled: !!profile && notifOpen,
  });

  async function markSeen(id: string) {
    await getSupabase()
      .from("hericilla_notifications_seen")
      .upsert({ outbox_id: id, user_id: profile!.id }, { onConflict: "outbox_id,user_id" });
    void qc.invalidateQueries({ queryKey: ["notif-popover", profile?.id] });
    void qc.invalidateQueries({ queryKey: ["my-notifications", profile?.id] });
  }

  async function markAllSeen() {
    const items = notifItems ?? [];
    if (items.length === 0) return;
    await getSupabase()
      .from("hericilla_notifications_seen")
      .upsert(items.map((r) => ({ outbox_id: r.id, user_id: profile!.id })), { onConflict: "outbox_id,user_id" });
    void qc.invalidateQueries({ queryKey: ["notif-popover", profile?.id] });
    void qc.invalidateQueries({ queryKey: ["my-notifications", profile?.id] });
  }

  function handleNotifClick(id: string, data: Record<string, string> | null | undefined) {
    void markSeen(id);
    const entity = data?.entity;
    if (entity === "hericilla_enquiries") router.push("/inbox");
    else if (entity === "hericilla_job_applications") router.push("/cms/careers");
    else router.push("/notifications");
    setNotifOpen(false);
  }

  // Close popover on Escape / outside click
  useEffect(() => {
    if (!notifOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setNotifOpen(false); };
    const onClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [notifOpen]);

  // The box searches page titles only (it is not a record search), so a non-empty query
  // always shows something: the matching destinations, or an explicit "no page matches".
  const trimmedQuery = query.trim();
  const matches = useMemo(() => {
    const q = trimmedQuery.toLowerCase();
    if (!q) return [];
    return ALL_DESTINATIONS.filter(
      (d) => d.label.toLowerCase().includes(q) || d.description.toLowerCase().includes(q),
    ).slice(0, 6);
  }, [trimmedQuery]);

  // The page-search dropdown dismisses on click-away, like the notifications menu.
  useEffect(() => {
    if (!trimmedQuery) return;
    const onClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setQuery("");
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [trimmedQuery]);

  const isActive = (href: string) => href === activeHref;

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar (desktop) — collapsible via the toggle button */}
      <aside
        className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 bg-brand-950 text-white transition-[width] duration-200 ${
          collapsed ? "lg:w-20" : "lg:w-64"
        }`}
      >
        <div className={`flex items-center border-b border-brand-900 ${collapsed ? "flex-col gap-2 p-3" : "gap-3 p-5"}`}>
          <Link href="/dashboard" className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
            <span className="rounded-xl bg-white p-1">
              <Image src="/logo.png" alt="" width={40} height={40} className="block rounded-lg" />
            </span>
            {!collapsed && (
              <span className="text-base font-extrabold leading-tight">
                Hericilla
                <span className="block text-xs font-medium text-brand-200">Admin portal</span>
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`p-2 rounded-lg text-brand-200 hover:bg-brand-900 hover:text-white transition ${
              collapsed ? "self-center" : "ml-auto"
            }`}
          >
            {collapsed ? <ChevronsRight className="h-5 w-5" /> : <ChevronsLeft className="h-5 w-5" />}
          </button>
        </div>

        <GroupedNav collapsed={collapsed} activeHref={activeHref} />

        {!collapsed && <div className="px-5 py-3 text-sm text-brand-200">Signed in as {profile?.full_name || profile?.email}</div>}
        <div className={`border-t border-brand-900 p-3 ${collapsed ? "flex justify-center" : "text-center"}`}>
          <a
            href="https://blackboxtech.online"
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-2 text-xs text-brand-200 hover:text-white ${collapsed ? "justify-center" : "flex-wrap justify-center"}`}
            title="Black-Box Tech"
          >
            <Image src="/blackboxtech.jpg" alt="Black-Box Tech logo" width={24} height={24} className="h-6 w-6 rounded-full" />
            {!collapsed && (
              <span>
                Designed and Developed by <strong className="font-bold">Black-Box Tech</strong> and Ayo Ogundipe.
              </span>
            )}
          </a>
        </div>
      </aside>

      <div className={`flex-1 pb-24 lg:pb-0 transition-[padding] duration-200 ${collapsed ? "lg:pl-20" : "lg:pl-64"}`}>
        {/* Top bar */}
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-[var(--color-line)]">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              className="lg:hidden p-2 -ml-2 rounded-lg text-brand-900 hover:bg-brand-50"
            >
              <Menu className="h-6 w-6" />
            </button>
            <Link href="/dashboard" className="lg:hidden flex items-center gap-2 font-extrabold text-brand-950">
              <span className="rounded-lg bg-white p-1 ring-1 ring-[var(--color-line)]">
                <Image src="/logo.png" alt="" width={32} height={32} className="block rounded" />
              </span>
              Hericilla
            </Link>
            <div className="relative flex-1 max-w-md ml-auto lg:ml-0" ref={searchRef}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-soft" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && matches.length > 0) {
                    e.preventDefault();
                    router.push(matches[0].href);
                    setQuery("");
                  } else if (e.key === "Escape") {
                    setQuery("");
                  }
                }}
                placeholder="Find a page…"
                aria-label="Find a page"
                className="w-full rounded-[var(--radius-btn)] border-2 border-[var(--color-line)] py-2.5 pl-10 pr-3 text-base focus:border-brand-400 focus:outline-none"
              />
              {trimmedQuery && (
                <div className="absolute top-full mt-1 w-full rounded-xl border border-[var(--color-line)] bg-white shadow-[var(--shadow-pop)] z-50 overflow-hidden">
                  {matches.map((m) => (
                    <Link
                      key={m.href}
                      href={m.href}
                      onClick={() => setQuery("")}
                      className="block px-4 py-3 hover:bg-brand-50"
                    >
                      <span className="font-bold text-brand-950">{m.label}</span>
                      <span className="block text-sm text-ink-soft">{m.description}</span>
                    </Link>
                  ))}
                  {matches.length === 0 && (
                    <p className="px-4 py-3 text-sm text-ink-soft">
                      No page matches “{trimmedQuery}”. This box jumps to screens; to find a job, invoice or
                      client, use the search and filters on that page.
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                aria-expanded={notifOpen}
                aria-label={unseen > 0 ? `Notifications — ${unseen} unread` : "Notifications"}
                className="relative p-2.5 rounded-full hover:bg-brand-50 text-ink-soft"
              >
                <Bell className="h-6 w-6" />
                {unseen > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-6 h-6 px-1 rounded-full bg-danger-600 text-white text-sm font-bold flex items-center justify-center">
                    {unseen > 99 ? "99+" : unseen}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-xl border border-[var(--color-line)] bg-white shadow-[var(--shadow-pop)] z-50 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
                    <span className="text-sm font-bold text-brand-950">Notifications</span>
                    <button type="button" onClick={() => setNotifOpen(false)} className="p-1 rounded hover:bg-brand-50 text-ink-soft" aria-label="Close">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {(notifItems ?? []).length === 0 ? (
                      <p className="px-4 py-8 text-center text-sm text-ink-soft">You&apos;re all caught up!</p>
                    ) : (
                      (notifItems ?? []).map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => handleNotifClick(n.id, n.data)}
                          className="w-full block px-4 py-3 text-left hover:bg-brand-50 border-b border-[var(--color-line)] last:border-b-0"
                        >
                          <span className="block text-sm font-bold text-brand-950">{n.title}</span>
                          <span className="mt-0.5 block text-xs text-ink-soft line-clamp-2">{n.body}</span>
                          <span className="mt-1 block text-xs text-ink-soft">{new Date(n.created_at).toLocaleString()}</span>
                        </button>
                      ))
                    )}
                  </div>
                  <div className="flex items-center justify-between border-t border-[var(--color-line)] px-4 py-2">
                    {(notifItems ?? []).length > 0 && (
                      <button type="button" onClick={() => void markAllSeen()} className="text-sm font-semibold text-brand-700 hover:underline">
                        Mark all as read
                      </button>
                    )}
                    <Link href="/notifications" className="text-sm font-semibold text-brand-700 hover:underline ml-auto" onClick={() => setNotifOpen(false)}>
                      View all notifications
                    </Link>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => void signOut()}
              className="flex items-center gap-2 rounded-[var(--radius-btn)] border-2 border-brand-200 px-4 py-2 font-semibold text-brand-800 hover:bg-brand-50"
            >
              <LogOut className="h-5 w-5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </div>

      {/* Mobile slide-over drawer with the full grouped navigation */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <aside className="relative flex h-full w-72 max-w-[80%] flex-col bg-brand-950 text-white shadow-xl">
            <div className="flex items-center gap-3 border-b border-brand-900 p-5">
              <span className="rounded-xl bg-white p-1">
                <Image src="/logo.png" alt="" width={36} height={36} className="block rounded-lg" />
              </span>
              <span className="text-base font-extrabold leading-tight">
                Hericilla
                <span className="block text-xs font-medium text-brand-200">Admin portal</span>
              </span>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close menu" className="ml-auto p-2 rounded-lg hover:bg-brand-900">
                <X className="h-5 w-5" />
              </button>
            </div>
            <GroupedNav activeHref={activeHref} onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      {/* Bottom nav (mobile) */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[var(--color-line)] flex"
        aria-label="Main"
      >
        {MOBILE_PRIMARY.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-bold ${
              isActive(n.href) ? "text-brand-700" : "text-ink-soft"
            }`}
          >
            {n.icon}
            {n.label.split(" ")[0]}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-bold text-ink-soft"
        >
          <Menu className="h-6 w-6" />
          Menu
        </button>
      </nav>
    </div>
  );
}

/** Friendly gate: shows a setup notice when env is missing, sign-out prompt when role is wrong. */
export function EnvNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-xl p-8 text-center">
      <h1 className="text-xl font-bold text-brand-950">{title}</h1>
      <p className="mt-3 text-base text-ink-soft">{body}</p>
    </div>
  );
}

export function useSupabaseReady() {
  return hasSupabaseEnv();
}
