"use client";

import { useState, useRef, useEffect } from "react";
import { useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Card } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { cn } from "@/lib/utils";
import { Send, Bot, User, Sparkles, Users, BookOpen, CircleDollarSign, Heart, ShieldAlert, Calendar, BarChart3, GraduationCap } from "lucide-react";
import { formatAssistantText } from "@/components/ai-chat";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const SUGGESTED_PROMPTS = [
  { icon: Users, label: "Student count", prompt: "How many students are currently enrolled?" },
  { icon: BookOpen, label: "Overdue books", prompt: "Which books are currently overdue?" },
  { icon: CircleDollarSign, label: "Fee status", prompt: "What is the fee collection rate this term?" },
  { icon: Heart, label: "Health visits", prompt: "How many clinic visits were recorded this week?" },
  { icon: ShieldAlert, label: "Discipline", prompt: "What are the most common discipline incidents?" },
  { icon: Calendar, label: "Attendance", prompt: "What is the overall attendance rate?" },
  { icon: BarChart3, label: "Exam results", prompt: "Which class performed best in the last exam?" },
  { icon: GraduationCap, label: "Staff overview", prompt: "How many teachers are on staff?" },
];

export default function AiAssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const school = useSchool();
  const chatAction = useAction(api.aiAssistant.chat);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = async (text?: string) => {
    const message = text || input.trim();
    if (!message || isLoading) return;

    if (!school) {
      const noSchoolMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "I need to know which school you're in before I can help.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, noSchoolMessage]);
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const result = await chatAction({
        message,
        schoolId: school._id,
        entryPoint: "chat",
        history: messages.map((m) => ({ role: m.role, content: m.content })),
      });

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: result.response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const showWelcome = messages.length === 0;

  return (
    <div className="max-w-4xl mx-auto h-full flex flex-col">
      {/* Header */}
      <div className="mb-6 shrink-0">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">AI Assistant</h1>
            <p className="text-sm text-muted-foreground">
              Ask questions about your school data in plain language
            </p>
          </div>
        </div>
      </div>

      <Card className="flex flex-col flex-1 min-h-0">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {showWelcome && (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-lg font-semibold mb-2">
                Hello! I&apos;m your SchoolMNG AI assistant
              </h2>
              <p className="text-sm text-muted-foreground mb-8 max-w-md mx-auto">
                I can help you answer questions about students, fees, attendance,
                exams, staff, and more. Just type your question below.
              </p>

              {/* Suggested Prompts */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto">
                {SUGGESTED_PROMPTS.map((prompt) => {
                  const Icon = prompt.icon;
                  return (
                    <button
                      key={prompt.label}
                      onClick={() => handleSend(prompt.prompt)}
                      className="p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-left group"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary mb-2 transition-colors" />
                      <p className="text-xs font-medium">{prompt.label}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-3",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[70%] rounded-2xl px-5 py-3 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted rounded-bl-md"
                )}
              >
                <div className="space-y-1">{formatAssistantText(msg.content)}</div>
              </div>
              {msg.role === "user" && (
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-1">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-muted rounded-2xl rounded-bl-md px-5 py-3">
                <BrandLoader variant="dots" size="sm" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-border p-4">
          <div className="flex items-center gap-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about students, fees, attendance, exams..."
              disabled={isLoading}
              className="flex-1 px-4 py-3 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors disabled:opacity-50"
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
              className="w-12 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            AI responses are generated by Mistral and may not always be accurate. Always verify important data.
          </p>
        </div>
      </Card>
    </div>
  );
}
