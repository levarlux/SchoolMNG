"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";

import { cn } from "@/lib/utils";
import { MessageSquare, Send, X, Bot, User, Sparkles } from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

/**
 * Render the AI's plain-text reply with ZERO markdown asterisks. Emphasis is
 * shown with colour instead of `*`/`**` characters (the model loves to
 * sprinkle them everywhere). Handles `***bold italic***`, `**bold**`,
 * `*italic*`, `` `code` ``, `#` headings, `-`/`•`/`*` bullets and blank
 * lines — and any `*` left over after parsing is stripped entirely so a
 * stray or malformed asterisk can never appear on screen.
 */
function parseInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  // Order matters: ***bold italic*** before **bold** before *italic*.
  const regex = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  const pushPlain = (s: string) => {
    // Hard guarantee: no asterisk character ever reaches the screen. A `*`
    // between two digits is a multiplication sign → show × instead of dropping it.
    const clean = s.replace(/(\d)\*(\d)/g, "$1×$2").replace(/\*/g, "");
    if (clean) parts.push(clean);
  };
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) pushPlain(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("***")) {
      parts.push(
        <em key={`bi${k++}`} className="not-italic text-primary/90">
          <strong className="font-semibold text-primary">{token.slice(3, -3)}</strong>
        </em>
      );
    } else if (token.startsWith("**")) {
      parts.push(
        <strong key={`b${k++}`} className="font-semibold text-primary">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`")) {
      parts.push(
        <code key={`c${k++}`} className="rounded bg-secondary/50 px-1 text-xs text-foreground">
          {token.slice(1, -1)}
        </code>
      );
    } else {
      parts.push(
        <em key={`i${k++}`} className="not-italic text-primary/80">
          {token.slice(1, -1)}
        </em>
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) pushPlain(text.slice(last));
  return parts;
}

export function formatAssistantText(text: string): ReactNode[] {
  return text.split("\n").map((line, i) => {
    const trimmed = line.trim();
    if (trimmed === "") return <div key={i} className="h-2" />;
    if (/^#{1,3}\s+/.test(trimmed)) {
      return (
        <p key={i} className="mt-1.5 first:mt-0 text-sm font-semibold text-foreground">
          {parseInline(trimmed.replace(/^#{1,3}\s+/, ""))}
        </p>
      );
    }
    if (/^[-•*]\s+/.test(trimmed)) {
      return (
        <div key={i} className="flex gap-2">
          <span className="text-primary shrink-0">•</span>
          <span className="flex-1">{parseInline(trimmed.replace(/^[-•*]\s+/, ""))}</span>
        </div>
      );
    }
    return <p key={i}>{parseInline(line)}</p>;
  });
}

export function AiChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const school = useSchool();
  const chatAction = useAction(api.aiAssistant.chat);
  const resetConversation = useAction(api.aiAssistant.resetConversation);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Welcome message
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: `Hello! I'm your SchoolMNG AI assistant. I can help you with:\n\n• Student info & grades\n• Fee balances & collection rates\n• Attendance & discipline\n• Staff & teacher data\n• Library & books\n• Reports & analytics\n\nWhat would you like to know?`,
          timestamp: new Date(),
        },
      ]);
    }
  }, [isOpen, messages.length]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    if (!school) {
      const noSchoolMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "I need to know which school you're in before I can help. Please try again from a school page.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, noSchoolMessage]);
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const result = await chatAction({
        message: text,
        schoolId: school._id,
        entryPoint: "chat",
        history: messages
          .filter((m) => m.id !== "welcome")
          .map((m) => ({ role: m.role, content: m.content })),
      });

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: result.response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
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

  const clearChat = () => {
    setMessages([]);
    setInput("");
    if (school) {
      resetConversation({ schoolId: school._id, entryPoint: "chat" }).catch((err) =>
        console.error("Failed to reset conversation:", err)
      );
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110",
          isOpen
            ? "bg-muted hover:bg-muted/80 text-muted-foreground"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        )}
        title={isOpen ? "Close AI Assistant" : "Open AI Assistant"}
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <Sparkles className="h-6 w-6" />
        )}
      </button>

      {/* Chat Panel */}
      <div
        className={cn(
          "fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 origin-bottom-right",
          isOpen
            ? "opacity-100 scale-100 translate-y-0"
            : "opacity-0 scale-95 translate-y-4 pointer-events-none"
        )}
        style={{ height: "520px" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-primary/10 to-primary/5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">SchoolMNG AI</h3>
              <p className="text-[10px] text-muted-foreground">Powered by Mistral</p>
            </div>
          </div>
          <button
            onClick={clearChat}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
          >
            Clear
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-2",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted rounded-bl-md"
                )}
              >
                <div className="whitespace-pre-wrap">
                  {msg.role === "assistant" ? formatAssistantText(msg.content) : msg.content}
                </div>
              </div>
              {msg.role === "user" && (
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-1">
                  <User className="h-3.5 w-3.5" />
                </div>
              )}
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex gap-2 justify-start">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                <BrandLoader variant="dots" size="sm" className="text-primary" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border p-3 bg-card">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your school data..."
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
