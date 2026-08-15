"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AnimatedGradient } from "@/components/ui/animated-gradient";
import { School, Sparkles, ArrowRight, X, GraduationCap, Users, BookOpen } from "lucide-react";

interface WelcomeTourProps {
  onComplete: () => void;
  onDismiss: () => void;
}

const TOUR_STEPS = [
  {
    icon: School,
    title: "Welcome to SchoolMNG",
    description: "Your all-in-one school management platform. Let us show you around!",
    gradient: ["#3b82f6", "#8b5cf6", "#ec4899"],
  },
  {
    icon: GraduationCap,
    title: "Smart Onboarding",
    description: "We'll help you set up your school in minutes. Answer a few questions and we'll configure everything for you.",
    gradient: ["#10b981", "#06b6d4", "#3b82f6"],
  },
  {
    icon: Users,
    title: "AI-Powered Setup",
    description: "Upload your existing records and our AI will analyze them to pre-fill your school configuration.",
    gradient: ["#f59e0b", "#ef4444", "#ec4899"],
  },
  {
    icon: BookOpen,
    title: "You're All Set!",
    description: "Your dashboard is ready. Start managing students, teachers, fees, and more — all in one place.",
    gradient: ["#8b5cf6", "#3b82f6", "#06b6d4"],
  },
];

export function WelcomeTour({ onComplete, onDismiss }: WelcomeTourProps) {
  const [step, setStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Check if user has seen the tour before
    const hasSeenTour = localStorage.getItem("schoolmng_welcome_tour_seen");
    if (hasSeenTour) {
      onComplete();
      return;
    }
    
    // Animate in
    setTimeout(() => setIsVisible(true), 100);
  }, [onComplete]);

  function handleComplete() {
    setIsExiting(true);
    setTimeout(() => {
      localStorage.setItem("schoolmng_welcome_tour_seen", "true");
      onComplete();
    }, 300);
  }

  function handleDismiss() {
    setIsExiting(true);
    setTimeout(() => {
      localStorage.setItem("schoolmng_welcome_tour_seen", "true");
      onDismiss();
    }, 300);
  }

  const currentTourStep = TOUR_STEPS[step];
  const Icon = currentTourStep.icon;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
        isVisible && !isExiting ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleDismiss}
      />

      {/* Card */}
      <div
        className={`relative w-full max-w-lg bg-background rounded-3xl shadow-2xl overflow-hidden transition-all duration-500 ${
          isVisible && !isExiting
            ? "scale-100 translate-y-0"
            : "scale-95 translate-y-4"
        }`}
      >
        {/* Animated Header */}
        <div className="relative h-48 overflow-hidden">
          <AnimatedGradient
            colors={currentTourStep.gradient}
            speed={0.4}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-20 h-20 rounded-3xl bg-white/20 backdrop-blur-sm flex items-center justify-center animate-bounce">
              <Icon className="h-10 w-10 text-white" />
            </div>
          </div>
          
          {/* Skip button */}
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/20 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-black/30 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8">
          <h2 className="text-2xl font-bold text-center mb-3">
            {currentTourStep.title}
          </h2>
          <p className="text-muted-foreground text-center leading-relaxed">
            {currentTourStep.description}
          </p>

          {/* Step indicators */}
          <div className="flex justify-center gap-2 mt-6">
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step
                    ? "w-8 bg-primary"
                    : i < step
                    ? "w-1.5 bg-primary/40"
                    : "w-1.5 bg-muted"
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-8">
            {step > 0 && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep((s) => s - 1)}
              >
                Back
              </Button>
            )}
            {step < TOUR_STEPS.length - 1 ? (
              <Button
                className="flex-1"
                onClick={() => setStep((s) => s + 1)}
              >
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button className="flex-1" onClick={handleComplete}>
                <Sparkles className="h-4 w-4 mr-2" />
                Get Started
              </Button>
            )}
          </div>

          {/* Skip link */}
          {step < TOUR_STEPS.length - 1 && (
            <button
              onClick={handleDismiss}
              className="w-full mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip tour
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
