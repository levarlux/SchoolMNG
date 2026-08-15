"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, CheckCheck, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

export function NotificationBell() {
  const school = useSchool();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // We need a recipientId — use a placeholder for now
  // In production this would be the Clerk user ID
  const recipientId = typeof window !== "undefined"
    ? localStorage.getItem("notification_recipient_id") || ""
    : "";

  const unreadCount = useQuery(
    api.notifications.getUnreadCount,
    recipientId ? { recipientId } : "skip"
  );

  const notifications = useQuery(
    api.notifications.listByRecipient,
    recipientId ? { recipientId } : "skip"
  );

  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const removeNotif = useMutation(api.notifications.remove);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const handleMarkAllRead = async () => {
    if (recipientId) {
      await markAllRead({ recipientId });
    }
  };

  const handleMarkRead = async (id: string) => {
    await markRead({ id: id as any });
  };

  const handleDelete = async (id: string) => {
    await removeNotif({ id: id as any });
  };

  if (!recipientId) return null;

  const recentNotifications = notifications?.slice(0, 8) ?? [];

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="sm"
        className="relative"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Bell className="h-5 w-5" />
        {(unreadCount ?? 0) > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount! > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-lg z-50">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-border">
            <h3 className="font-semibold text-sm">Notifications</h3>
            <div className="flex items-center gap-1">
              {(unreadCount ?? 0) > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={handleMarkAllRead}
                >
                  <CheckCheck className="h-3 w-3 mr-1" />
                  Mark all read
                </Button>
              )}
              <Link href="/dashboard/notifications">
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setIsOpen(false)}>
                  View all
                </Button>
              </Link>
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-[400px] overflow-y-auto">
            {recentNotifications.length === 0 ? (
              <div className="text-center py-8">
                <Bell className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No notifications</p>
              </div>
            ) : (
              recentNotifications.map((notif) => (
                <div
                  key={notif._id}
                  className={cn(
                    "flex items-start gap-3 p-3 hover:bg-muted/50 cursor-pointer border-b border-border/50 transition-colors",
                    notif.status === "unread" && "bg-primary/5"
                  )}
                  onClick={() => handleMarkRead(notif._id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm font-medium truncate",
                      notif.status === "unread" && "font-bold"
                    )}>
                      {notif.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {notif.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(notif.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {notif.status === "unread" && (
                      <span className="h-2 w-2 rounded-full bg-primary" />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(notif._id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
