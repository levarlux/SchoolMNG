"use client";

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Palette, Upload, ImageIcon, Loader2, Check, AlertCircle, Copy } from "lucide-react";
import { toast } from "sonner";

import { useOrganization } from "@clerk/nextjs";

export default function SettingsPage() {
  const school = useSchool();
  const { organization } = useOrganization();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (organization?.id) {
      navigator.clipboard.writeText(organization.id);
      setCopied(true);
      toast.success("Organization ID copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Use the JWT-based mutations — no need to pass a school ID
  const updateMySchool = useMutation(api.schools.updateMySchool);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const setMyLogo = useMutation(api.files.setMyLogo);

  const [primaryColor, setPrimaryColor] = useState("#2563eb");
  const [secondaryColor, setSecondaryColor] = useState("#64748b");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Sync form whenever school data arrives from Convex
  useEffect(() => {
    if (school) {
      setPrimaryColor(school.primaryColor);
      setSecondaryColor(school.secondaryColor);
    }
  }, [school]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateMySchool({ primaryColor, secondaryColor });
      toast.success("Branding updated — colors are now live!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to save: ${msg}`);
      console.error("[schools.updateMySchool]", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!result.ok) throw new Error(`Upload failed: ${result.statusText}`);
      const { storageId } = await result.json();
      await setMyLogo({ storageId });
      toast.success("Logo uploaded — sidebar updated!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to upload logo: ${msg}`);
      console.error("[files.setMyLogo]", err);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Customize your school&apos;s branding.</p>
      </div>

      {/* Show a clear warning when school isn't linked yet */}
      {school === null && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
          <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">School not linked to this organisation</p>
            <p className="text-sm">
              Ask your super-admin to create a school record for this Clerk organisation. Until then, colour and logo changes cannot be saved.
            </p>
            {organization?.id && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs font-mono bg-amber-100/50 px-2.5 py-1.5 rounded border border-amber-200/50 select-all">
                  Clerk Org ID: {organization.id}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="h-8 px-2.5 bg-amber-100/50 hover:bg-amber-100 border-amber-200/50 text-amber-900 cursor-pointer flex items-center gap-1.5"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-green-600 animate-in fade-in zoom-in duration-200" />
                      <span className="text-xs">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span className="text-xs">Copy ID</span>
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Colors ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" /> Brand Colors
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: "Primary", value: primaryColor, onChange: setPrimaryColor },
                { label: "Secondary", value: secondaryColor, onChange: setSecondaryColor },
              ].map(({ label, value, onChange }) => (
                <div key={label}>
                  <Label>{label} Color</Label>
                  <div className="flex gap-2 mt-1">
                    <input
                      type="color"
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                      className="h-10 w-10 rounded-lg border border-border cursor-pointer flex-shrink-0"
                    />
                    <Input
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                      pattern="^#[0-9A-Fa-f]{6}$"
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Live preview */}
            <div className="p-4 rounded-lg border border-border bg-muted/50 space-y-2">
              <p className="text-sm font-medium">Live Preview</p>
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  P
                </div>
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: secondaryColor }}
                >
                  S
                </div>
                <span className="text-sm text-muted-foreground">
                  Sidebar updates after saving.
                </span>
              </div>
            </div>

            <Button type="submit" disabled={saving || school === null} className="gap-2">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Logo ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" /> School Logo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {school?.logoUrl ? (
            <div className="flex items-center gap-4">
              <img
                src={school.logoUrl}
                alt="School logo"
                className="h-16 w-auto rounded-lg border border-border object-contain bg-muted/30 p-1"
              />
              <div>
                <p className="text-sm font-medium">Current logo</p>
                <p className="text-xs text-muted-foreground">Upload a new image to replace it</p>
              </div>
            </div>
          ) : (
            <div className="h-16 w-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted/30">
              <Upload className="h-6 w-6 text-muted-foreground" />
            </div>
          )}

          <div>
            <Label htmlFor="logo-upload">
              {school?.logoUrl ? "Replace logo" : "Upload logo"}
            </Label>
            <div className="flex items-center gap-3 mt-1">
              <Input
                id="logo-upload"
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                disabled={uploading || school === null}
                className="max-w-sm"
              />
              {uploading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              PNG or SVG recommended · max 2 MB · square aspect ratio works best
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
