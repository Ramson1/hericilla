"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Truck,
  Wallet,
  Inbox,
  Grid3X3,
  LogOut,
  Search,
  Bell,
  CalendarCheck,
  Boxes,
} from "lucide-react";
import { hasSupabaseEnv } from "@hericilla/supabase-clients";
import { useUnseenCount } from "@hericilla/push-web";
import { useAuth } from "@/lib/auth";

type NavItem = { href: string; label: string; icon: ReactNode; hint: string };

/** Primary nav = 7 large items (elderly-first), per master plan. Powers the mobile bottom bar. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-6 w-6" />, hint: "Your day at a glance" },
  { href: "/jobs", label: "Jobs", icon: <ClipboardList className="h-6 w-6" />, hint: "Service requests and work orders" },
  { href: "/people", label: "People", icon: <Users className="h-6 w-6" />, hint: "Clients, staff and suppliers" },
  { href: "/vehicles", label: "Vehicles", icon: <Truck className="h-6 w-6" />, hint: "Fleet, allocations and movements" },
  { href: "/money", label: "Money", icon: <Wallet className="h-6 w-6" />, hint: "Invoices, expenses and payroll" },
  { href: "/inbox", label: "Inbox", icon: <Inbox className="h-6 w-6" />, hint: "Enquiries, chats and announcements" },
  { href: "/more", label: "More", icon: <Grid3X3 className="h-6 w-6" />, hint: "Everything else, grouped" },
];

/** Desktop sidebar nav = primary items plus the frequently-sought Attendance and Inventory. */
export const SIDEBAR_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-6 w-6" />, hint: "Your day at a glance" },
  { href: "/jobs", label: "Jobs", icon: <ClipboardList className="h-6 w-6" />, hint: "Service requests and work orders" },
  { href: "/people", label: "People", icon: <Users className="h-6 w-6" />, hint: "Clients, staff and suppliers" },
  { href: "/attendance", label: "Attendance", icon: <CalendarCheck className="h-6 w-6" />, hint: "Who clocked in, exceptions and corrections" },
  { href: "/vehicles", label: "Vehicles", icon: <Truck className="h-6 w-6" />, hint: "Fleet, allocations and movements" },
  { href: "/inventory", label: "Inventory", icon: <Boxes className="h-6 w-6" />, hint: "Stock in, stock out, reorder alerts" },
  { href: "/money", label: "Money", icon: <Wallet className="h-6 w-6" />, hint: "Invoices, expenses and payroll" },
  { href: "/inbox", label: "Inbox", icon: <Inbox className="h-6 w-6" />, hint: "Enquiries, chats and announcements" },
  { href: "/more", label: "More", icon: <Grid3X3 className="h-6 w-6" />, hint: "Everything else, grouped" },
];

/** Flat destination list powering the “Find anything” search. */
export const ALL_DESTINATIONS: { href: string; label: string; description: string }[] = [
  { href: "/dashboard", label: "Dashboard", description: "KPIs, today's attendance and what needs you" },
  { href: "/jobs", label: "Jobs — Service requests", description: "Create and track requests from new to closed" },
  { href: "/work-orders", label: "Work orders", description: "Every approved job with its WO number" },
  { href: "/clients", label: "Clients", description: "Companies we serve, contacts and contracts" },
  { href: "/suppliers", label: "Suppliers", description: "Who we buy from and how they perform" },
  { href: "/procurement", label: "Procurement", description: "Purchase requests, approvals and orders" },
  { href: "/packing", label: "Packing & Removal", description: "Move jobs, item lists and handovers" },
  { href: "/inventory", label: "Inventory", description: "Stock in, stock out, reorder alerts" },
  { href: "/documents", label: "Contracts & Documents", description: "Every file with expiry reminders" },
  { href: "/money", label: "Finance & Billing", description: "Invoices, payments and ageing" },
  { href: "/people", label: "Staff", description: "Employee register, roles and licences" },
  { href: "/attendance", label: "Attendance & Shifts", description: "Who clocked in, exceptions and corrections" },
  { href: "/payroll", label: "Salary Allocator", description: "Payroll runs, payslips and approvals" },
  { href: "/vehicles", label: "Vehicles", description: "Fleet register and live movement board" },
  { href: "/deliveries", label: "Deliveries & trip costs", description: "POD verification and expense approvals" },
  { href: "/reports", label: "Reports", description: "The eight report families" },
  { href: "/inbox", label: "Inbox — Enquiries", description: "Website enquiries awaiting action" },
  { href: "/inbox/chat", label: "Inbox — Live chat", description: "Conversations from the website" },
  { href: "/cms", label: "Website CMS", description: "Blog, testimonials, careers and page text" },
  { href: "/settings", label: "Settings & Permissions", description: "Roles, rules and reminders" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const [query, setQuery] = useState("");
  const unseen = useUnseenCount(profile?.id ?? null, profile?.role ?? null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return ALL_DESTINATIONS.filter(
      (d) => d.label.toLowerCase().includes(q) || d.description.toLowerCase().includes(q),
    ).slice(0, 6);
  }, [query]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-brand-950 text-white">
        <div className="p-5">
          <Link href="/dashboard" className="flex items-center gap-3">
            <Image src="/logo.png" alt="" width={40} height={40} className="rounded-lg" />
            <span className="text-base font-extrabold leading-tight">
              Hericilla
              <span className="block text-xs font-medium text-brand-200">Admin portal</span>
            </span>
          </Link>
        </div>
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto" aria-label="Main">
          {SIDEBAR_NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-base font-semibold transition ${
                isActive(n.href) ? "bg-white text-brand-950" : "hover:bg-brand-900"
              }`}
            >
              {n.icon}
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="p-5 text-sm text-brand-200">Signed in as {profile?.full_name || profile?.email}</div>
      </aside>

      <div className="flex-1 lg:pl-64 pb-24 lg:pb-0">
        {/* Top bar */}
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-[var(--color-line)]">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
            <Link href="/dashboard" className="lg:hidden flex items-center gap-2 font-extrabold text-brand-950">
              <Image src="/logo.png" alt="" width={32} height={32} className="rounded" />
              Hericilla
            </Link>
            <div className="relative flex-1 max-w-md ml-auto lg:ml-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-soft" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find anything…"
                aria-label="Find anything"
                className="w-full rounded-[var(--radius-btn)] border-2 border-[var(--color-line)] py-2.5 pl-10 pr-3 text-base focus:border-brand-400 focus:outline-none"
              />
              {matches.length > 0 && (
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
                </div>
              )}
            </div>
            <Link
              href="/notifications"
              className="relative p-2.5 rounded-full hover:bg-brand-50 text-ink-soft"
              aria-label={unseen > 0 ? `Notifications — ${unseen} unread` : "Notifications"}
            >
              <Bell className="h-6 w-6" />
              {unseen > 0 && (
                <span className="absolute -top-1 -right-1 min-w-6 h-6 px-1 rounded-full bg-danger-600 text-white text-sm font-bold flex items-center justify-center">
                  {unseen > 99 ? "99+" : unseen}
                </span>
              )}
            </Link>
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

      {/* Bottom nav (mobile) */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[var(--color-line)] flex"
        aria-label="Main"
      >
        {PRIMARY_NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-bold ${
              isActive(n.href) ? "text-brand-700" : "text-ink-soft"
            }`}
          >
            {n.icon}
            {n.label}
          </Link>
        ))}
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
