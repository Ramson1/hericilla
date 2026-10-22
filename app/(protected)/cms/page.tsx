"use client";

import Link from "next/link";
import { PageHeader, HintCard } from "@hericilla/ui";
import { PenLine, Quote, Briefcase, LayoutTemplate } from "lucide-react";

const items = [
  { href: "/cms/blog", label: "Blog & news", desc: "Write and publish articles for the website", icon: <PenLine className="h-8 w-8" /> },
  { href: "/cms/testimonials", label: "Testimonials", desc: "Client praise shown on the homepage and page", icon: <Quote className="h-8 w-8" /> },
  { href: "/cms/careers", label: "Careers", desc: "Job vacancies and the applications that come in", icon: <Briefcase className="h-8 w-8" /> },
  { href: "/cms/pages", label: "Page text", desc: "Change headline and paragraph text on the site", icon: <LayoutTemplate className="h-8 w-8" /> },
];

export default function CmsPage() {
  return (
    <div>
      <PageHeader
        title="Website CMS"
        purpose="Everything that shows on the public website but is not a job: articles, testimonials, vacancies and page wording."
      />
      <HintCard
        steps={[
          "Pick what you want to change.",
          "Only published or approved items appear on the live site.",
          "The website updates itself within about a minute.",
        ]}
      />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="rounded-[var(--radius-card)] bg-white border border-[var(--color-line)] p-6 shadow-[var(--shadow-card)] hover:border-brand-400 hover:shadow-[var(--shadow-pop)] transition"
          >
            <span className="inline-flex rounded-2xl bg-brand-100 text-brand-800 p-3">{it.icon}</span>
            <p className="mt-3 text-xl font-bold text-brand-950">{it.label}</p>
            <p className="text-base text-ink-soft">{it.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
