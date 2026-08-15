"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Settings, Shield, CreditCard, Bell, Database, Globe, Key, Users,
  Save, AlertTriangle, CheckCircle2, Copy, Eye, EyeOff,
  Mail, Smartphone, Clock, Lock, Unlock, Server, Activity, Zap,
} from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";

type Tab = "platform" | "security" | "billing" | "notifications" | "system";

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "platform", label: "Platform", icon: Globe },
  { id: "security", label: "Security", icon: Shield },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "system", label: "System", icon: Server },
];

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("platform");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Platform settings state
  const [platformName, setPlatformName] = useState("SchoolMNG");
  const [supportEmail, setSupportEmail] = useState("support@schoolmng.com");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [allowRegistration, setAllowRegistration] = useState(true);
  const [requireEmailVerification, setRequireEmailVerification] = useState(true);
  const [maxSchoolsPerAdmin, setMaxSchoolsPerAdmin] = useState("5");

  // Security settings state
  const [sessionTimeout, setSessionTimeout] = useState("24");
  const [requireMFA, setRequireMFA] = useState(false);
  const [passwordMinLength, setPasswordMinLength] = useState("8");
  const [maxLoginAttempts, setMaxLoginAttempts] = useState("5");
  const [lockoutDuration, setLockoutDuration] = useState("30");
  const [allowPasswordReset, setAllowPasswordReset] = useState(true);

  // Billing settings state
  const [paystackMode, setPaystackMode] = useState<"test" | "live">("test");
  const [defaultTrialDays, setDefaultTrialDays] = useState("14");
  const [autoSuspendOnExpiry, setAutoSuspendOnExpiry] = useState(true);
  const [gracePeriodDays, setGracePeriodDays] = useState("7");

  // Notification settings state
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [notifyOnNewSchool, setNotifyOnNewSchool] = useState(true);
  const [notifyOnPayment, setNotifyOnPayment] = useState(true);
  const [notifyOnError, setNotifyOnError] = useState(true);

  const handleSave = async () => {
    setSaving(true);
    // Simulate save
    await new Promise((r) => setTimeout(r, 1000));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure platform-wide settings and preferences
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <BrandLoader variant="dots" size="sm" className="mr-2" />
          ) : saved ? (
            <CheckCircle2 className="h-4 w-4 mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar tabs */}
        <div className="lg:w-56 shrink-0">
          <nav className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-6">
          {/* Platform Settings */}
          {activeTab === "platform" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    General Settings
                  </CardTitle>
                  <CardDescription>
                    Basic platform configuration
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Platform Name</Label>
                      <Input
                        value={platformName}
                        onChange={(e) => setPlatformName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Support Email</Label>
                      <Input
                        type="email"
                        value={supportEmail}
                        onChange={(e) => setSupportEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Schools per Admin</Label>
                      <Input
                        type="number"
                        value={maxSchoolsPerAdmin}
                        onChange={(e) => setMaxSchoolsPerAdmin(e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    Access Control
                  </CardTitle>
                  <CardDescription>
                    Control who can access the platform
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ToggleSetting
                    label="Maintenance Mode"
                    description="Temporarily disable access to the platform for non-admins"
                    enabled={maintenanceMode}
                    onChange={setMaintenanceMode}
                    icon={AlertTriangle}
                    danger
                  />
                  <ToggleSetting
                    label="Allow Registration"
                    description="Allow new schools to register on the platform"
                    enabled={allowRegistration}
                    onChange={setAllowRegistration}
                    icon={Users}
                  />
                  <ToggleSetting
                    label="Require Email Verification"
                    description="Require new users to verify their email before accessing the platform"
                    enabled={requireEmailVerification}
                    onChange={setRequireEmailVerification}
                    icon={Mail}
                  />
                </CardContent>
              </Card>
            </>
          )}

          {/* Security Settings */}
          {activeTab === "security" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Authentication
                  </CardTitle>
                  <CardDescription>
                    Configure authentication and session settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Session Timeout (hours)</Label>
                      <Input
                        type="number"
                        value={sessionTimeout}
                        onChange={(e) => setSessionTimeout(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Users will be logged out after this period of inactivity
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Minimum Password Length</Label>
                      <Input
                        type="number"
                        value={passwordMinLength}
                        onChange={(e) => setPasswordMinLength(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Login Attempts</Label>
                      <Input
                        type="number"
                        value={maxLoginAttempts}
                        onChange={(e) => setMaxLoginAttempts(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Lock account after this many failed attempts
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Lockout Duration (minutes)</Label>
                      <Input
                        type="number"
                        value={lockoutDuration}
                        onChange={(e) => setLockoutDuration(e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lock className="h-5 w-5" />
                    Security Features
                  </CardTitle>
                  <CardDescription>
                    Additional security measures
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ToggleSetting
                    label="Require Multi-Factor Authentication"
                    description="Force all users to enable MFA for their accounts"
                    enabled={requireMFA}
                    onChange={setRequireMFA}
                    icon={Key}
                  />
                  <ToggleSetting
                    label="Allow Password Reset"
                    description="Allow users to reset their password via email"
                    enabled={allowPasswordReset}
                    onChange={setAllowPasswordReset}
                    icon={Unlock}
                  />
                </CardContent>
              </Card>
            </>
          )}

          {/* Billing Settings */}
          {activeTab === "billing" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Payment Configuration
                  </CardTitle>
                  <CardDescription>
                    Configure payment gateway and billing settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Paystack Mode</Label>
                    <div className="flex gap-2">
                      <Button
                        variant={paystackMode === "test" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setPaystackMode("test")}
                      >
                        Test Mode
                      </Button>
                      <Button
                        variant={paystackMode === "live" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setPaystackMode("live")}
                      >
                        Live Mode
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {paystackMode === "test"
                        ? "Using test keys — no real charges"
                        : "⚠️ Using live keys — real charges will occur"}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Default Trial Period (days)</Label>
                      <Input
                        type="number"
                        value={defaultTrialDays}
                        onChange={(e) => setDefaultTrialDays(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Grace Period (days)</Label>
                      <Input
                        type="number"
                        value={gracePeriodDays}
                        onChange={(e) => setGracePeriodDays(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Days after expiry before suspending school
                      </p>
                    </div>
                  </div>

                  <ToggleSetting
                    label="Auto-Suspend on Expiry"
                    description="Automatically suspend schools when their subscription expires"
                    enabled={autoSuspendOnExpiry}
                    onChange={setAutoSuspendOnExpiry}
                    icon={AlertTriangle}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Payment Gateway Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${paystackMode === "live" ? "bg-green-500" : "bg-amber-500"}`} />
                        <div>
                          <p className="text-sm font-medium">Paystack</p>
                          <p className="text-xs text-muted-foreground">
                            {paystackMode === "live" ? "Live Environment" : "Test Environment"}
                          </p>
                        </div>
                      </div>
                      <Badge variant={paystackMode === "live" ? "default" : "secondary"}>
                        {paystackMode === "live" ? "Active" : "Testing"}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Notification Settings */}
          {activeTab === "notifications" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    Notification Channels
                  </CardTitle>
                  <CardDescription>
                    Choose how you want to receive notifications
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ToggleSetting
                    label="Email Notifications"
                    description="Receive notifications via email"
                    enabled={emailNotifications}
                    onChange={setEmailNotifications}
                    icon={Mail}
                  />
                  <ToggleSetting
                    label="SMS Notifications"
                    description="Receive critical alerts via SMS (requires SMS provider)"
                    enabled={smsNotifications}
                    onChange={setSmsNotifications}
                    icon={Smartphone}
                  />
                  <div className="space-y-2">
                    <Label>Webhook URL (optional)</Label>
                    <Input
                      placeholder="https://your-service.com/webhook"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Receive notifications to an external service
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    Event Subscriptions
                  </CardTitle>
                  <CardDescription>
                    Choose which events trigger notifications
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ToggleSetting
                    label="New School Registration"
                    description="Get notified when a new school joins the platform"
                    enabled={notifyOnNewSchool}
                    onChange={setNotifyOnNewSchool}
                    icon={CheckCircle2}
                  />
                  <ToggleSetting
                    label="Payment Received"
                    description="Get notified when a school makes a payment"
                    enabled={notifyOnPayment}
                    onChange={setNotifyOnPayment}
                    icon={CreditCard}
                  />
                  <ToggleSetting
                    label="System Errors"
                    description="Get notified when critical errors occur"
                    enabled={notifyOnError}
                    onChange={setNotifyOnError}
                    icon={AlertTriangle}
                  />
                </CardContent>
              </Card>
            </>
          )}

          {/* System Settings */}
          {activeTab === "system" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5" />
                    System Information
                  </CardTitle>
                  <CardDescription>
                    Current system status and configuration
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <InfoRow label="Platform Version" value="v0.2.1" />
                    <InfoRow label="Environment" value="Development" badge="Dev" />
                    <InfoRow label="Backend" value="Convex" />
                    <InfoRow label="Auth Provider" value="Clerk" />
                    <InfoRow label="Payment Gateway" value="Paystack" />
                    <InfoRow label="Database" value="Convex DB" />
                    <InfoRow label="Deployment Region" value="Global" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Quick Actions
                  </CardTitle>
                  <CardDescription>
                    System maintenance and debugging tools
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Button variant="outline" className="justify-start h-auto py-3">
                      <div className="text-left">
                        <p className="font-medium">Clear Cache</p>
                        <p className="text-xs text-muted-foreground">Reset platform cache</p>
                      </div>
                    </Button>
                    <Button variant="outline" className="justify-start h-auto py-3">
                      <div className="text-left">
                        <p className="font-medium">Export Data</p>
                        <p className="text-xs text-muted-foreground">Download all platform data</p>
                      </div>
                    </Button>
                    <Button variant="outline" className="justify-start h-auto py-3">
                      <div className="text-left">
                        <p className="font-medium">View Logs</p>
                        <p className="text-xs text-muted-foreground">Access system logs</p>
                      </div>
                    </Button>
                    <Button variant="outline" className="justify-start h-auto py-3">
                      <div className="text-left">
                        <p className="font-medium">API Documentation</p>
                        <p className="text-xs text-muted-foreground">View API reference</p>
                      </div>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Reusable toggle setting component
function ToggleSetting({
  label,
  description,
  enabled,
  onChange,
  icon: Icon,
  danger = false,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
  icon: React.ElementType;
  danger?: boolean;
}) {
  return (
    <div className="flex items-start justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 mt-0.5 ${danger ? "text-amber-500" : "text-muted-foreground"}`} />
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          enabled
            ? danger
              ? "bg-amber-500"
              : "bg-primary"
            : "bg-muted"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${
            enabled ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

// Reusable info row component
function InfoRow({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium">{value}</p>
        {badge && (
          <Badge variant="secondary" className="text-xs">
            {badge}
          </Badge>
        )}
      </div>
    </div>
  );
}
