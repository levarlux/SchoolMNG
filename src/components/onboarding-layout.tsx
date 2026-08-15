"use client";

import { ReactNode } from "react";
import { School, Check, LucideIcon } from "lucide-react";

interface OnboardingLayoutProps {
  children: ReactNode;
  currentStep: number;
  totalSteps: number;
  stepTitle: string;
  stepDescription: string;
  stepIcon: LucideIcon;
  steps: Array<{ id: number; title: string; icon: LucideIcon }>;
  onStepClick?: (stepIndex: number) => void;
}

export function OnboardingLayout({
  children,
  currentStep,
  totalSteps,
  stepTitle,
  stepDescription,
  stepIcon: StepIcon,
  steps,
  onStepClick,
}: OnboardingLayoutProps) {
  const progress = ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Left Panel - Brand panel (matches sign-in / sign-up gradient) */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-[#0ea5e9] via-[#0284c7] to-[#f97316] h-full">
        {/* Animated gradient blobs (same palette as sign-in/sign-up) */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-gradient-to-br from-[#38bdf8]/40 to-[#fb923c]/30 blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
          <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] rounded-full bg-gradient-to-tl from-[#f43f5e]/30 to-[#0ea5e9]/40 blur-3xl animate-pulse" style={{ animationDuration: '6s', animationDelay: '2s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-gradient-to-r from-[#fbbf24]/20 to-[#38bdf8]/20 blur-3xl animate-pulse" style={{ animationDuration: '8s', animationDelay: '1s' }} />
        </div>

        <div className="relative z-10 flex flex-col p-8 xl:p-12 w-full h-full overflow-hidden">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
              <School className="h-5 w-5 text-white" />
            </div>
            <span className="text-white font-semibold">SchoolMNG</span>
          </div>

          {/* Progress */}
          <div className="mb-6">
            <div className="flex items-center justify-between text-sm text-white/60 mb-2">
              <span>Step {currentStep + 1} of {totalSteps}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#38bdf8] to-[#fb923c] rounded-full transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Current Step Info - balanced spacing, no flex-1 */}
          <div className="space-y-4 mb-10">
            <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center mx-auto">
              <StepIcon className="h-8 w-8 text-white" />
            </div>
            <div className="text-center">
              <h2 className="text-3xl xl:text-4xl font-bold text-white tracking-tight">
                {stepTitle}
              </h2>
              <p className="text-lg text-white/70 leading-relaxed mt-2">
                {stepDescription}
              </p>
            </div>
          </div>

          {/* Step Indicators - natural flow after current step */}
          <div className="space-y-1.5 overflow-y-auto overscroll-contain max-h-[300px]">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === currentStep;
              const isDone = index < currentStep;
              
              return (
                <button
                  key={step.id}
                  onClick={() => {
                    // Only allow jumping back to already-visited steps — the
                    // wizard advances sequentially (Phase 1.4: no skipping ahead).
                    if (index <= currentStep) onStepClick?.(index);
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                    isActive
                      ? "bg-white/10 backdrop-blur-sm"
                      : index > currentStep
                        ? "cursor-not-allowed opacity-50"
                        : "hover:bg-white/5"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isDone
                        ? "bg-green-500/20 text-green-400"
                        : isActive
                        ? "bg-blue-500/20 text-blue-400"
                        : "bg-white/5 text-white/40"
                    }`}
                  >
                    {isDone ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      isActive
                        ? "text-white"
                        : isDone
                        ? "text-white/70"
                        : "text-white/40"
                    }`}
                  >
                    {step.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Panel - Content (1/2 width) */}
      <div className="flex-1 lg:w-1/2 flex flex-col bg-background h-full overflow-hidden">
        {/* Mobile Header */}
        <div className="lg:hidden p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <School className="h-4 w-4 text-primary" />
              </div>
              <span className="font-semibold text-sm">SchoolMNG</span>
            </div>
            <span className="text-xs text-muted-foreground">
              Step {currentStep + 1} of {totalSteps}
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="max-w-2xl mx-auto p-6 lg:p-8 xl:p-12">
            {children}
          </div>
        </div>

        {/* Bottom Document Upload Area */}
        <div className="border-t border-border bg-muted/30 p-3 shrink-0">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <svg
                  className="h-4 w-4 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>
              <div>
                <p className="font-medium text-foreground">
                  Have existing records?
                </p>
                <p className="text-xs">
                  Upload CSV, Excel, or PDF files and our AI will analyze and
                  auto-populate your setup.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
