"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Bell, CheckCheck, Trash2, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { Id } from "../../../../convex/_generated/dataModel";

type StatusFilter = "all" | "unread" | "read" | "actioned";

export default function NotificationsPage() {
  const school = useSchool();
  const [filter, setFilter] = useState<StatusFilter>("all");

  // Placeholder recipientId — in production use Clerk user ID
  const recipientId = typeof window !== "undefined"
    ? localStorage.getItem("notification_recipient_id") || ""
    : "";

  const notifications = useQuery(
    api.notifications.listByRecipient,
    recipientId
      ? { recipientId, status: filter === "all" ? undefined : filter }
      : "skip"
  );

  const stats = useQuery(
    api.notifications.getStats,
    school ? { schoolId: school._id } : "skip"
  );

  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const removeNotif = useMutation(api.notifications.remove);

  const handleMarkAllRead = async () => {
    if (recipientId) {
      await markAllRead({ recipientId });
      toast.success("All notifications marked as read");
    }
  };

  const handleMarkRead = async (id: string) => {
    await markRead({ id: id as Id<"notifications"> });
  };

  const handleDelete = async (id: string) => {
    await removeNotif({ id: id as Id<"notifications"> });
    toast.success("Notification deleted");
  };

  if (!school) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            <p className="text-muted-foreground text-sm">
              Your notification inbox
            </p>
          </div>
        </div>
        {(stats?.unread ?? 0) > 0 && (
          <Button onClick={handleMarkAllRead}>
            <CheckCheck className="h-4 w-4 mr-2" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{stats?.total ?? 0}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-primary">{stats?.unread ?? 0}</p>
            <p className="text-xs text-muted-foreground">Unread</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{stats?.read ?? 0}</p>
            <p className="text-xs text-muted-foreground">Read</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{stats?.actioned ?? 0}</p>
            <p className="text-xs text-muted-foreground">Actioned</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(["all", "unread", "read", "actioned"] as StatusFilter[]).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === "all" && <Filter className="h-3 w-3 mr-1" />}
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      {/* Notifications List */}
      <Card>
        <CardContent className="p-0">
          {!notifications || notifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No notifications</p>
            </div>
          ) : (
            <div>
              {notifications.map((notif) => (
                <div
                  key={notif._id}
                  className={cn(
                    "flex items-center gap-4 p-4 border-b border-border last:border-0 hover:bg-muted/50 transition-colors",
                    notif.status === "unread" && "bg-primary/5"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={cn(
                        "text-sm font-medium",
                        notif.status === "unread" && "font-bold"
                      )}>
                        {notif.title}
                      </p>
                      {notif.status === "unread" && (
                        <Badge variant="default" className="text-[10px]">New</Badge>
                      )}
                      {notif.status === "actioned" && (
                        <Badge variant="secondary" className="text-[10px]">Actioned</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {notif.message}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{new Date(notif.createdAt).toLocaleString()}</span>
                      {notif.relatedRecordId && (
                        <Badge variant="outline" className="text-[10px]">
                          Related Record
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {notif.status === "unread" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMarkRead(notif._id)}
                      >
                        <CheckCheck className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(notif._id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
