"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SignInButton, useAuth } from "@clerk/clerk-react";
import { useConvexAuth } from "convex/react";
import { Button } from "@/components/ui/button";
import {
  Library,
  School,
  Users,
  BarChart3,
  Shield,
  Sparkles,
  BookOpenCheck,
  TrendingUp,
  ArrowRight,
  CheckCircle,
  GraduationCap,
  ClipboardList,
  Bell,
  Star,
} from "lucide-react";
import Link from "next/link";
import { useIsSuperadmin } from "@/lib/use-admin";

const FEATURES = [
  {
    icon: BookOpenCheck,
    title: "Simplify workflows",
    text: "Centralise academics, library, fees, exams, HR, health and transport — all in one beautifully unified platform.",
    color: "from-violet-500 to-purple-600",
  },
  {
    icon: Users,
    title: "Real-team collaboration",
    text: "Staff, teachers, and admins work together in real-time with role-based access and live dashboards.",
    color: "from-blue-500 to-cyan-500",
  },
  {
    icon: Sparkles,
    title: "AI-driven goal focus",
    text: "Ask anything about your school and get instant, data-backed answers from our built-in AI assistant.",
    color: "from-pink-500 to-rose-500",
  },
];

const STATS = [
  { label: "Schools enrolled", value: "10k+", icon: School },
  { label: "Students managed", value: "50k+", icon: GraduationCap },
  { label: "Team collaboration", value: "5k+", icon: Users },
  { label: "Automation", value: "99.9%", icon: BarChart3 },
];

const LOGOS = [
  { name: "Canva", letter: "C" },
  { name: "Figma", letter: "F" },
  { name: "Roamtech", letter: "R" },
  { name: "Photobox", letter: "P" },
  { name: "Acrovid", letter: "A" },
  { name: "Dontify", letter: "D" },
  { name: "Zaphr", letter: "Z" },
];

/* ── Inline dashboard mockup (pure CSS/JSX) ───────────────────── */
function DashboardMockup() {
  return (
    <div className="relative w-full max-w-4xl mx-auto mt-14 px-4">
      {/* Glow blobs behind the card */}
      <div className="absolute inset-0 -top-8 flex items-center justify-center pointer-events-none">
        <div className="w-[500px] h-[220px] rounded-full bg-violet-300/40 blur-3xl" />
      </div>
      <div className="absolute right-10 top-4 pointer-events-none">
        <div className="w-[240px] h-[180px] rounded-full bg-blue-300/30 blur-3xl" />
      </div>

      {/* Main card */}
      <div
        className="relative rounded-2xl border border-white/60 shadow-2xl overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.72)",
          backdropFilter: "blur(24px)",
        }}
      >
        {/* Top bar */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100/80 bg-white/50">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
          <div className="flex-1 mx-4 h-5 rounded-md bg-slate-100 max-w-[240px]" />
          <div className="h-5 w-16 rounded-md bg-slate-100" />
        </div>

        <div className="flex">
          {/* Sidebar */}
          <div className="hidden sm:flex flex-col gap-3 p-4 bg-white/60 border-r border-slate-100/80 min-w-[52px]">
            {[Library, ClipboardList, Users, BarChart3, Bell, Shield].map(
              (Icon, i) => (
                <div
                  key={i}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${i === 0 ? "bg-violet-600 text-white shadow-md" : "bg-slate-100 text-slate-400"}`}
                >
                  <Icon className="h-4 w-4" />
                </div>
              )
            )}
          </div>

          {/* Main content */}
          <div className="flex-1 p-5 grid grid-cols-12 gap-4">
            {/* Left column */}
            <div className="col-span-12 md:col-span-7 space-y-4">
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Total Students", val: "2,847", color: "bg-violet-50 border-violet-100", badge: "+12%", badgeColor: "text-violet-600 bg-violet-100" },
                  { label: "Fee Collection", val: "KES 84K", color: "bg-blue-50 border-blue-100", badge: "+8%", badgeColor: "text-blue-600 bg-blue-100" },
                  { label: "Staff Active", val: "142", color: "bg-emerald-50 border-emerald-100", badge: "+3%", badgeColor: "text-emerald-600 bg-emerald-100" },
                ].map((s) => (
                  <div key={s.label} className={`rounded-xl border p-3 ${s.color}`}>
                    <p className="text-[10px] text-slate-500 font-medium">{s.label}</p>
                    <p className="text-base font-bold text-slate-800 mt-0.5">{s.val}</p>
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${s.badgeColor}`}>
                      {s.badge}
                    </span>
                  </div>
                ))}
              </div>

              {/* Chart placeholder */}
              <div className="rounded-xl border border-slate-100 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-slate-700">Enrollment Trends</p>
                  <div className="flex gap-1">
                    {["Week","Month","Year"].map((t,i) => (
                      <button key={t} className={`text-[9px] px-2 py-0.5 rounded-full ${i===1 ? "bg-violet-600 text-white" : "text-slate-400"}`}>{t}</button>
                    ))}
                  </div>
                </div>
                {/* Fake chart bars */}
                <div className="flex items-end gap-1.5 h-16">
                  {[40,65,45,80,55,90,70,85,60,95,75,88].map((h,i) => (
                    <div key={i} className="flex-1 rounded-t-sm" style={{
                      height: `${h}%`,
                      background: i === 9
                        ? "linear-gradient(to top,#7c3aed,#a78bfa)"
                        : `rgba(139,92,246,${0.15 + i*0.02})`,
                    }} />
                  ))}
                </div>
                {/* Line */}
                <svg viewBox="0 0 300 40" className="w-full mt-1" fill="none">
                  <polyline
                    points="0,32 25,20 50,28 75,10 100,18 125,5 150,14 175,8 200,16 225,4 250,11 275,7 300,3"
                    stroke="#7c3aed" strokeWidth="1.5" strokeLinejoin="round" fill="none"
                  />
                  <polyline
                    points="0,32 25,20 50,28 75,10 100,18 125,5 150,14 175,8 200,16 225,4 250,11 275,7 300,3"
                    stroke="url(#grad)" strokeWidth="0" fill="url(#fill)"
                  />
                  <defs>
                    <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.15"/>
                      <stop offset="100%" stopColor="#7c3aed" stopOpacity="0"/>
                    </linearGradient>
                  </defs>
                </svg>
              </div>

              {/* Task list */}
              <div className="rounded-xl border border-slate-100 bg-white p-4">
                <p className="text-xs font-semibold text-slate-700 mb-3">Recent Tasks</p>
                <div className="space-y-2">
                  {[
                    { label: "Term exam schedule published", tag: "Done", tagColor: "text-emerald-600 bg-emerald-50" },
                    { label: "Fee reminders sent to parents", tag: "In Progress", tagColor: "text-blue-600 bg-blue-50" },
                    { label: "New staff onboarding docs", tag: "Pending", tagColor: "text-orange-600 bg-orange-50" },
                  ].map((t) => (
                    <div key={t.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm border border-slate-200 flex items-center justify-center">
                          {t.tag === "Done" && <div className="w-2 h-2 rounded-sm bg-emerald-500" />}
                        </div>
                        <span className="text-[11px] text-slate-600">{t.label}</span>
                      </div>
                      <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${t.tagColor}`}>{t.tag}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="col-span-12 md:col-span-5 space-y-4">
              {/* Profile card */}
              <div className="rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 p-4 text-white shadow-lg">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-white/30 flex items-center justify-center text-xs font-bold">A</div>
                  <div>
                    <p className="text-xs font-semibold">Admin Dashboard</p>
                    <p className="text-[9px] opacity-70">SchoolMNG Pro</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="bg-white/15 rounded-lg p-2">
                    <p className="text-[9px] opacity-70">Classes</p>
                    <p className="text-sm font-bold">48</p>
                  </div>
                  <div className="bg-white/15 rounded-lg p-2">
                    <p className="text-[9px] opacity-70">Teachers</p>
                    <p className="text-sm font-bold">62</p>
                  </div>
                </div>
              </div>

              {/* Mini calendar/quick stats */}
              <div className="rounded-xl border border-slate-100 bg-white p-4 space-y-2">
                <p className="text-xs font-semibold text-slate-700">Quick Stats</p>
                {[
                  { label: "Attendance today", val: "94%", w: 94 },
                  { label: "Fees collected", val: "78%", w: 78 },
                  { label: "Assignments graded", val: "61%", w: 61 },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="flex justify-between text-[9px] text-slate-500 mb-0.5">
                      <span>{s.label}</span><span className="font-semibold text-slate-700">{s.val}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-400" style={{ width: `${s.w}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Upcoming */}
              <div className="rounded-xl border border-slate-100 bg-white p-4">
                <p className="text-xs font-semibold text-slate-700 mb-2">Upcoming Events</p>
                {[
                  { title: "Board Meeting", time: "10:00 AM", color: "bg-violet-500" },
                  { title: "PTA Session", time: "2:00 PM", color: "bg-blue-500" },
                  { title: "Sports Day", time: "Tomorrow", color: "bg-orange-400" },
                ].map((e) => (
                  <div key={e.title} className="flex items-center gap-2 py-1">
                    <div className={`w-1.5 h-6 rounded-full ${e.color}`} />
                    <div>
                      <p className="text-[10px] font-medium text-slate-700">{e.title}</p>
                      <p className="text-[9px] text-slate-400">{e.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating badge */}
      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-xl border border-slate-100">
        <div className="flex -space-x-1">
          {["#7c3aed","#3b82f6","#ec4899","#10b981"].map((c) => (
            <div key={c} className="w-6 h-6 rounded-full border-2 border-white" style={{ background: c }} />
          ))}
        </div>
        <span className="text-xs font-semibold text-slate-700">+10k schools trust us</span>
        <div className="flex gap-0.5">
          {[1,2,3,4,5].map((s) => <Star key={s} className="h-3 w-3 fill-yellow-400 text-yellow-400" />)}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { userId, isLoaded } = useAuth();
  const { isLoading: authLoading } = useConvexAuth();
  const isSuperadmin = useIsSuperadmin();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded || authLoading || isSuperadmin === undefined) return;
    if (isSuperadmin) {
      router.replace("/admin");
    }
  }, [isSuperadmin, isLoaded, authLoading, router]);

  if (isSuperadmin) return null;
  if (!isLoaded) return null;

  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{
        background:
          "linear-gradient(135deg, #f0eeff 0%, #e8eeff 30%, #eef4ff 60%, #f5f0ff 100%)",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* ── Global decorative blobs ─────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div
          className="absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full opacity-40"
          style={{ background: "radial-gradient(circle, #c4b5fd 0%, transparent 70%)" }}
        />
        <div
          className="absolute top-1/3 -right-48 w-[600px] h-[600px] rounded-full opacity-30"
          style={{ background: "radial-gradient(circle, #bfdbfe 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-0 left-1/3 w-[500px] h-[400px] rounded-full opacity-25"
          style={{ background: "radial-gradient(circle, #ddd6fe 0%, transparent 70%)" }}
        />
      </div>

      {/* ── Navbar ─────────────────────────────────────────────── */}
      <nav className="relative z-50 flex items-center justify-between px-8 py-4 max-w-7xl mx-auto">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shadow-md shadow-violet-200">
            <Library className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-slate-800 tracking-tight">SchoolMNG</span>
        </div>

        {/* Auth buttons */}
        <div className="flex items-center gap-3">
          {userId ? (
            <Link href="/dashboard">
              <Button className="rounded-full bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white px-5 shadow-md shadow-violet-200 text-sm">
                Dashboard <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </Link>
          ) : (
            <>
              <Link href="/sign-in">
                <button className="text-sm font-medium text-slate-600 hover:text-violet-600 transition-colors px-3 py-1.5">
                  Sign In
                </button>
              </Link>
              <Link href="/sign-up">
                <Button className="rounded-full bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white px-5 shadow-md shadow-violet-200 text-sm">
                  Get Started
                </Button>
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="relative z-10 text-center px-6 pt-16 pb-8 max-w-5xl mx-auto">
        {/* Pill badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-100 text-violet-700 text-xs font-semibold mb-6 border border-violet-200">
          <Sparkles className="h-3.5 w-3.5" />
          Now with AI-powered school insights
        </div>

        {/* Headline */}
        <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900 leading-[1.12] tracking-tight mb-5">
          Manage your school smarter,{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage:
                "linear-gradient(135deg,#7c3aed 0%,#6366f1 50%,#2563eb 100%)",
            }}
          >
            collaborate better together
          </span>
        </h1>

        {/* Subtext */}
        <p className="text-base md:text-lg text-slate-500 max-w-2xl mx-auto mb-8 leading-relaxed">
          Stay on top of every deadline with smart planning tools designed to
          organise academics, fees, exams, HR, and tasks efficiently.
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {userId ? (
            <Link href="/dashboard">
              <Button
                size="lg"
                className="rounded-full bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white px-8 py-3 text-sm font-semibold shadow-lg shadow-violet-200 transition-all hover:shadow-xl hover:-translate-y-0.5"
              >
                Go to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <>
              <SignInButton mode="modal">
                <Button
                  size="lg"
                  className="rounded-full bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white px-8 text-sm font-semibold shadow-lg shadow-violet-200 transition-all hover:shadow-xl hover:-translate-y-0.5"
                >
                  Start Free Trial <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </SignInButton>
              <Link href="/sign-in">
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-full border-2 border-slate-200 text-slate-700 hover:border-violet-300 hover:text-violet-600 bg-white/70 backdrop-blur-sm px-8 text-sm font-semibold transition-all"
                >
                  See how it works
                </Button>
              </Link>
            </>
          )}
        </div>
      </section>

      {/* ── Dashboard Mockup ────────────────────────────────────── */}
      <DashboardMockup />

      {/* ── Logo row ────────────────────────────────────────────── */}
      <section className="relative z-10 mt-16 px-6 pb-8">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-xs font-semibold text-slate-400 uppercase tracking-widest mb-6">
            Trusted by leading educational institutions
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8">
            {LOGOS.map((logo) => (
              <div
                key={logo.name}
                className="flex items-center gap-2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <div className="w-6 h-6 rounded bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
                  {logo.letter}
                </div>
                <span className="text-sm font-semibold">{logo.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────── */}
      <section className="relative z-10 py-16 px-6">
        <div className="max-w-4xl mx-auto text-center mb-10">
          <p className="text-xs font-semibold text-violet-500 uppercase tracking-widest mb-2">Why we are</p>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 max-w-xl mx-auto">
            Stay on top of every deadline with smart planning tools designed to
            <span className="text-violet-600"> organise</span> projects and tasks efficiently
          </h2>
        </div>
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {STATS.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="text-center bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-white/80 shadow-sm hover:shadow-md transition-all"
              >
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-violet-50 mb-3">
                  <Icon className="h-5 w-5 text-violet-600" />
                </div>
                <p className="text-3xl font-extrabold text-slate-900">{stat.value}</p>
                <p className="text-xs text-slate-500 mt-1 font-medium">{stat.label}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────── */}
      <section className="relative z-10 py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold text-violet-500 uppercase tracking-widest mb-2">How it works</p>
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 max-w-2xl mx-auto">
              Simplify workflows, collaborate seamlessly, and manage tasks{" "}
              <span className="text-violet-600">effectively</span> for better school growth
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="group bg-white/70 backdrop-blur-sm rounded-2xl p-6 border border-white/80 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all"
                >
                  <div
                    className={`w-11 h-11 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 shadow-md`}
                  >
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="text-base font-bold text-slate-800 mb-2">{f.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{f.text}</p>
                  <div className="flex items-center gap-1 mt-4 text-violet-600 text-xs font-semibold group-hover:gap-2 transition-all">
                    Learn more <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ───────────────────────────────────────────── */}
      <section className="relative z-10 py-12 px-6 pb-24">
        <div className="max-w-5xl mx-auto">
          <div
            className="rounded-3xl px-10 py-12 text-white text-center relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg,#1e1b4b 0%,#312e81 40%,#1e3a8a 100%)",
            }}
          >
            {/* Decorative circles */}
            <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/5" />
            <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/5" />

            <div className="relative">
              <p className="text-xs font-semibold text-violet-300 uppercase tracking-widest mb-3">
                Get started today
              </p>
              <h2 className="text-2xl md:text-4xl font-extrabold mb-4 leading-tight">
                Ready to transform<br />your school management?
              </h2>
              <p className="text-sm text-white/60 max-w-md mx-auto mb-8">
                Join thousands of schools already using SchoolMNG to streamline operations and improve student outcomes.
              </p>

              {/* Checklist */}
              <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-white/80 mb-8">
                {["No setup fees","Free onboarding","Cancel anytime","99.9% uptime SLA"].map((item) => (
                  <span key={item} className="flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4 text-emerald-400" />
                    {item}
                  </span>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                {userId ? (
                  <Link href="/dashboard">
                    <Button size="lg" className="rounded-full bg-white text-violet-700 hover:bg-violet-50 px-8 font-semibold shadow-xl text-sm transition-all">
                      Go to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                ) : (
                  <>
                    <SignInButton mode="modal">
                      <Button size="lg" className="rounded-full bg-white text-violet-700 hover:bg-violet-50 px-8 font-semibold shadow-xl text-sm transition-all">
                        Start Free Trial <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </SignInButton>
                    <Link href="/sign-in">
                      <Button
                        size="lg"
                        variant="outline"
                        className="rounded-full border-white/30 text-white hover:bg-white/10 px-8 text-sm font-semibold"
                      >
                        Sign In
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-slate-200/80 py-10 px-6 bg-white/40 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center">
              <Library className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-slate-800">SchoolMNG</span>
          </div>



          <p className="text-sm text-slate-400">
            © {new Date().getFullYear()} SchoolMNG. Built for modern schools.
          </p>
        </div>
      </footer>
    </div>
  );
}
