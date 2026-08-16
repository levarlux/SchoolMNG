"use client";

/**
 * Finance Config — Maps EAV fields to fee calculation roles.
 *
 * Schools designate which EAV fields represent fee amounts, due dates,
 * and categories. When configured, the finance engine reads from EAV
 * fieldValues instead of the hardcoded fee_structures table.
 */

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Select } from "../ui/select";
import { Badge } from "../ui/badge";
import { BrandLoader } from "../ui/brand-loader";
import { DollarSign, Calendar, Tag, Percent, ToggleLeft, ToggleRight, Save, Info } from "lucide-react";
import { toast } from "sonner";

interface FinanceConfigProps {
  schoolId: Id<"schools">;
}

export function FinanceConfig({ schoolId }: FinanceConfigProps) {
  const config = useQuery(api.financeConfig.get, { schoolId });
  const amountFields = useQuery(api.financeConfig.listAmountFields, { schoolId });
  const dateFields = useQuery(api.financeConfig.listDateFields, { schoolId });
  const upsertConfig = useMutation(api.financeConfig.upsert);

  const [useEav, setUseEav] = useState(false);
  const [amountFieldId, setAmountFieldId] = useState<string>("");
  const [dueDateFieldId, setDueDateFieldId] = useState<string>("");
  const [categoryFieldId, setCategoryFieldId] = useState<string>("");
  const [discountFieldId, setDiscountFieldId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Sync form when config loads
  if (config !== undefined && config !== null) {
    if (useEav !== config.useEavForFees) setUseEav(config.useEavForFees);
    if (amountFieldId !== (config.amountFieldId ?? "")) setAmountFieldId(config.amountFieldId ?? "");
    if (dueDateFieldId !== (config.dueDateFieldId ?? "")) setDueDateFieldId(config.dueDateFieldId ?? "");
    if (categoryFieldId !== (config.categoryFieldId ?? "")) setCategoryFieldId(config.categoryFieldId ?? "");
    if (discountFieldId !== (config.discountFieldId ?? "")) setDiscountFieldId(config.discountFieldId ?? "");
  }

  if (config === undefined || amountFields === undefined || dateFields === undefined) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <BrandLoader variant="dots" />
        </CardContent>
      </Card>
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      await upsertConfig({
        schoolId,
        useEavForFees: useEav,
        useEavForPayments: useEav, // sync with fees for now
        amountFieldId: amountFieldId ? (amountFieldId as Id<"fields">) : undefined,
        dueDateFieldId: dueDateFieldId ? (dueDateFieldId as Id<"fields">) : undefined,
        categoryFieldId: categoryFieldId ? (categoryFieldId as Id<"fields">) : undefined,
        discountFieldId: discountFieldId ? (discountFieldId as Id<"fields">) : undefined,
      });
      toast.success("Finance configuration saved!");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save finance config");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" /> Finance Engine Configuration
        </CardTitle>
        <CardDescription>
          Map your custom EAV fields to fee calculation. When enabled, the finance
          engine reads fee amounts from your EAV fields instead of the built-in
          fee structures table.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg border">
          <div className="flex items-center gap-3">
            {useEav ? (
              <ToggleRight className="h-6 w-6 text-primary" />
            ) : (
              <ToggleLeft className="h-6 w-6 text-muted-foreground" />
            )}
            <div>
              <p className="text-sm font-medium">Use EAV Fields for Fees</p>
              <p className="text-xs text-muted-foreground">
                {useEav
                  ? "Fee amounts are read from your custom EAV fields"
                  : "Fee amounts use the built-in fee_structures table"}
              </p>
            </div>
          </div>
          <Button
            variant={useEav ? "default" : "outline"}
            size="sm"
            onClick={() => setUseEav(!useEav)}
          >
            {useEav ? "Enabled" : "Disabled"}
          </Button>
        </div>

        {useEav && (
          <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4" />
              <p>
                Tag your EAV fields with the appropriate <code>semantic</code> type in
                Settings → Data Structure to make them available here.
              </p>
            </div>

            {/* Amount field */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" /> Fee Amount Field
              </Label>
              <Select value={amountFieldId} onChange={(e) => setAmountFieldId(e.target.value)}>
                <option value="">Select a field tagged as &quot;amount&quot;...</option>
                {amountFields?.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name} ({f.inputType})
                  </option>
                ))}
              </Select>
              {amountFields?.length === 0 && (
                <p className="text-xs text-amber-600">
                  No fields tagged with semantic &quot;amount&quot;. Create one in Settings → Data Structure.
                </p>
              )}
            </div>

            {/* Due date field */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> Due Date Field
              </Label>
              <Select value={dueDateFieldId} onChange={(e) => setDueDateFieldId(e.target.value)}>
                <option value="">Select a field tagged as &quot;date&quot;...</option>
                {dateFields?.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name} ({f.inputType})
                  </option>
                ))}
              </Select>
            </div>

            {/* Category field */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" /> Fee Category Field
              </Label>
              <Select value={categoryFieldId} onChange={(e) => setCategoryFieldId(e.target.value)}>
                <option value="">Select a text field for fee category...</option>
                {amountFields?.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </div>

            {/* Discount field */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Percent className="h-3.5 w-3.5" /> Discount/Scholarship Field
              </Label>
              <Select value={discountFieldId} onChange={(e) => setDiscountFieldId(e.target.value)}>
                <option value="">Select a numeric field for discounts...</option>
                {amountFields?.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        )}

        {/* Save button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <BrandLoader variant="dots" size="sm" className="mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Configuration
          </Button>
        </div>

        {/* Status badge */}
        {config && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Status:</span>
            {config.useEavForFees ? (
              <Badge variant="default" className="text-[10px]">EAV Active</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">Using fee_structures</Badge>
            )}
            {config.amountFieldId && (
              <Badge variant="secondary" className="text-[10px]">
                Amount: {amountFields?.find((f) => f._id === config.amountFieldId)?.name ?? "Unknown"}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
