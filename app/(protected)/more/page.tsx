"use client";

import Link from "next/link";
import { PageHeader, HintCard } from "@hericilla/ui";
import {
  Building2,
  ClipboardList,
  FileText,
  Package,
  Truck,
  Users,
  Wallet,
  BarChart3,
  Settings,
  Globe,
  MessageCircle,
  CalendarCheck,
  Boxes,
  Wrench,
} from "lucide-react";

const groups = [
  {
    title: "Running the business",
    items: [
      { href: "/clients", label: "Clients", desc: "Companies we serve, contacts and contracts", icon: <Building2 className="h-8 w-8" /> },
      { href: "/jobs", label: "Service requests", desc: "New → quoted → approved → done", icon: <ClipboardList className="h-8 w-8" /> },
      { href: "/work-orders", label: "Work orders", desc: "Every approved job with its WO number", icon: <Wrench className="h-8 w-8" /> },
      { href: "/suppliers", label: "Suppliers", desc: "Who we buy from and how they perform", icon: <Users className="h-8 w-8" /> },
    ],
  },
  {
    title: "Getting work done",
    items: [
      { href: "/procurement", label: "Procurement", desc: "Requests, comparisons, approvals, POs", icon: <Package className="h-8 w-8" /> },
      { href: "/packing", label: "Packing & removal", desc: "Move jobs, item lists, handovers", icon: <Boxes className="h-8 w-8" /> },
      { href: "/inventory", label: "Inventory", desc: "Stock ledger and reorder alerts", icon: <Boxes className="h-8 w-8" /> },
      { href: "/vehicles", label: "Vehicles", desc: "Fleet register and live movement board", icon: <Truck className="h-8 w-8" /> },
      { href: "/deliveries", label: "Deliveries & trip costs", desc: "Verify proof of delivery, approve fuel money", icon: <ClipboardList className="h-8 w-8" /> },
      { href: "/documents", label: "Documents", desc: "Contracts, permits and expiry reminders", icon: <FileText className="h-8 w-8" /> },
    ],
  },
  {
    title: "People & money",
    items: [
      { href: "/people", label: "Staff register", desc: "Employees, roles, licences", icon: <Users className="h-8 w-8" /> },
      { href: "/attendance", label: "Attendance & shifts", desc: "Who is where, and the exceptions", icon: <CalendarCheck className="h-8 w-8" /> },
      { href: "/payroll", label: "Salary allocator", desc: "Payroll runs and payslips", icon: <Wallet className="h-8 w-8" /> },
      { href: "/money", label: "Finance & billing", desc: "Invoices, payments and ageing", icon: <Wallet className="h-8 w-8" /> },
    ],
  },
  {
    title: "Talking & improving",
    items: [
      { href: "/inbox", label: "Enquiries", desc: "Website requests waiting for a reply", icon: <MessageCircle className="h-8 w-8" /> },
      { href: "/inbox/chat", label: "Live chat", desc: "Conversations from the website", icon: <MessageCircle className="h-8 w-8" /> },
      { href: "/cms", label: "Website CMS", desc: "Blog, testimonials, careers, page text", icon: <Globe className="h-8 w-8" /> },
      { href: "/reports", label: "Reports", desc: "The eight report families", icon: <BarChart3 className="h-8 w-8" /> },
      { href: "/settings", label: "Settings", desc: "Permissions, limits and rules", icon: <Settings className="h-8 w-8" /> },
    ],
  },
];

export default function MorePage() {
  return (
    <div>
      <PageHeader
        title="Everything else"
        purpose="All the sections that do not fit the seven main buttons, grouped so each one is easy to find."
      />
      <HintCard
        steps={[
          "Pick the group that matches what you need.",
          "Each tile explains itself in one line.",
          "Or use the “Find anything” box at the top instead.",
        ]}
      />
      {groups.map((g) => (
        <section key={g.title} className="mt-10">
          <h2 className="text-lg font-bold text-brand-950 mb-4">{g.title}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="rounded-[var(--radius-card)] bg-white border border-[var(--color-line)] p-6 shadow-[var(--shadow-card)] hover:border-brand-400 hover:shadow-[var(--shadow-pop)] transition"
              >
                <span className="inline-flex rounded-2xl bg-brand-100 text-brand-800 p-3">{it.icon}</span>
                <p className="mt-3 text-lg font-bold text-brand-950">{it.label}</p>
                <p className="text-base text-ink-soft">{it.desc}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
