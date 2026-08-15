"use client";

import { SignUp } from "@clerk/clerk-react";
import { Library, Sparkles, BookOpenCheck, ShieldCheck, TrendingUp, School, Users, BarChart3, CheckCircle2 } from "lucide-react";
import Link from "next/link";

const FEATURES = [
  { icon: BookOpenCheck, title: "Run your whole school", text: "Academics, library, fees, exams, HR, health and transport in one place." },
  { icon: TrendingUp, title: "Know your numbers", text: "Real-time dashboards, reports and term-by-term performance insights." },
  { icon: Sparkles, title: "AI Assistant", text: "Ask anything about your school and get instant answers backed by your data." },
  { icon: ShieldCheck, title: "Secure by design", text: "Role-based access, audit trails and bank-grade data protection." },
];

const BENEFITS = [
  "Free tier available for small schools",
  "Set up in under 10 minutes",
  "No credit card required",
  "Cancel anytime, no lock-in",
];

export function SignUpClient() {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      {/* Brand panel with flowy gradient animation */}
      <div className="hidden lg:flex flex-col justify-center items-center p-12 relative overflow-hidden bg-gradient-to-br from-[#0ea5e9] via-[#0284c7] to-[#f97316]">
        {/* Animated gradient blobs */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-gradient-to-br from-[#38bdf8]/40 to-[#fb923c]/30 blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
          <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] rounded-full bg-gradient-to-tl from-[#f43f5e]/30 to-[#0ea5e9]/40 blur-3xl animate-pulse" style={{ animationDuration: '6s', animationDelay: '2s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-gradient-to-r from-[#fbbf24]/20 to-[#38bdf8]/20 blur-3xl animate-pulse" style={{ animationDuration: '8s', animationDelay: '1s' }} />
        </div>
        
        {/* Content centered */}
        <div className="relative z-10 flex flex-col items-center text-center max-w-md">
          {/* Logo */}
          <div className="flex items-center gap-3 text-white mb-12">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
              <Library className="h-8 w-8" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">SchoolMNG</p>
              <p className="text-sm text-white/80 mt-1">All-in-one school management</p>
            </div>
          </div>

          {/* Headline */}
          <h1 className="text-4xl font-bold text-white leading-tight mb-8">
            Set up your school in minutes — manage it for years.
          </h1>

          {/* Features */}
          <div className="space-y-4 w-full">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="flex items-start gap-4 p-4 rounded-xl bg-white/10 backdrop-blur-sm">
                  <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-white">{f.title}</p>
                    <p className="text-sm text-white/80">{f.text}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Benefits */}
          <div className="mt-8 w-full">
            <div className="grid grid-cols-2 gap-3">
              {BENEFITS.map((benefit) => (
                <div key={benefit} className="flex items-center gap-2 text-white/90 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-[#fbbf24] shrink-0" />
                  <span>{benefit}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="relative text-xs text-white/50 mt-8">
          © {new Date().getFullYear()} SchoolMNG. Built for modern schools.
        </p>
      </div>

      {/* Auth panel - centered */}
      <div className="flex min-h-screen items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="w-full max-w-md space-y-6">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 justify-center">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0ea5e9] to-[#f97316] flex items-center justify-center shadow-lg">
              <Library className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold">SchoolMNG</p>
              <p className="text-xs text-muted-foreground">School Management</p>
            </div>
          </div>

          {/* Welcome text */}
          <div className="text-center lg:text-left">
            <h2 className="text-2xl font-bold">Create your school</h2>
            <p className="text-muted-foreground mt-1">Get started with a free account</p>
          </div>

          {/* Clerk Sign Up */}
          <SignUp
            routing="path"
            path="/sign-up"
            forceRedirectUrl="/onboarding"
            appearance={{
              elements: {
                card: "shadow-xl rounded-2xl border-border bg-white",
                headerTitle: "text-2xl font-bold",
                formButtonPrimary: "bg-gradient-to-r from-[#0ea5e9] to-[#0284c7] hover:from-[#0284c7] hover:to-[#0369a1] text-white rounded-xl py-2.5 font-medium transition-all shadow-md hover:shadow-lg",
                footerActionLink: "text-[#0ea5e9] font-medium hover:text-[#0284c7]",
                formFieldInput: "rounded-xl border-border focus:ring-[#0ea5e9] focus:border-[#0ea5e9]",
              },
            }}
          />

          {/* Sign in link */}
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/sign-in" className="font-medium text-[#0ea5e9] hover:text-[#0284c7] transition-colors">
              Sign in
            </Link>
          </p>

          {/* Back to home */}
          <div className="text-center">
            <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
