"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { useSchool } from "@/lib/use-school";
import { useRole } from "@/lib/use-role";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Plus, Search, Loader2, Package, Trash2 } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  "Furniture", "Electronics", "Stationery", "Sports", "Laboratory",
  "Textbooks", "Uniforms", "Kitchen", "Cleaning", "Other",
];

const CONDITIONS = [
  { value: "good", label: "Good", color: "text-green-600" },
  { value: "fair", label: "Fair", color: "text-yellow-600" },
  { value: "poor", label: "Poor", color: "text-orange-600" },
  { value: "damaged", label: "Damaged", color: "text-red-600" },
];

function formatCurrency(amount: number) {
  return `KES ${amount.toLocaleString("en-KE")}`;
}

export default function InventoryPage() {
  const school = useSchool();
  const role = useRole();
  const isPrincipal = role === "principal";
  const items = useQuery(api.inventory.listBySchool, school ? { schoolId: school._id } : "skip");
  const summary = useQuery(api.inventory.getSummary, school ? { schoolId: school._id } : "skip");
  const createItem = useMutation(api.inventory.create);
  const deleteItem = useMutation(api.inventory.remove);

  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [showModal, setShowModal] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Other");
  const [quantity, setQuantity] = useState("1");
  const [condition, setCondition] = useState("good");
  const [location, setLocation] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");

  if (items === undefined || summary === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filtered = items.filter((item) => {
    if (!item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCategory && item.category !== filterCategory) return false;
    return true;
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !name.trim()) {
      toast.error("Please fill all required fields");
      return;
    }
    try {
      await createItem({
        schoolId: school._id,
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        quantity: parseInt(quantity) || 1,
        condition: condition as any,
        location: location.trim() || undefined,
        purchasePrice: purchasePrice ? parseFloat(purchasePrice) : undefined,
        purchaseDate: Date.now(),
      });
      toast.success("Item added");
      setShowModal(false);
      setName("");
      setDescription("");
      setCategory("Other");
      setQuantity("1");
      setCondition("good");
      setLocation("");
      setPurchasePrice("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add item");
    }
  }

  async function handleDelete(id: Id<"inventory_items">) {
    if (!confirm("Are you sure you want to delete this item?")) return;
    try {
      await deleteItem({ id });
      toast.success("Item deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete item");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Inventory</h1>
          <p className="text-muted-foreground mt-1">School supplies and equipment</p>
        </div>
        {isPrincipal && (
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Item
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalItems}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Quantity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalQuantity}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.totalValue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Damaged</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{summary.byCondition["damaged"] ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-secondary/5">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Category</th>
                <th className="text-center p-3 font-medium">Qty</th>
                <th className="text-left p-3 font-medium">Condition</th>
                <th className="text-left p-3 font-medium">Location</th>
                <th className="text-right p-3 font-medium">Value</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const condInfo = CONDITIONS.find((c) => c.value === item.condition);
                return (
                  <tr key={item._id} className="border-t border-border hover:bg-secondary/5">
                    <td className="p-3 font-medium">
                      <div>{item.name}</div>
                      {item.description && (
                        <div className="text-xs text-muted-foreground">{item.description}</div>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary/10">
                        {item.category}
                      </span>
                    </td>
                    <td className="p-3 text-center font-medium">{item.quantity}</td>
                    <td className="p-3">
                      <span className={`font-medium ${condInfo?.color}`}>{condInfo?.label}</span>
                    </td>
                    <td className="p-3 text-muted-foreground">{item.location || "—"}</td>
                    <td className="p-3 text-right text-muted-foreground">
                      {item.purchasePrice ? formatCurrency(item.purchasePrice) : "—"}
                    </td>
                    <td className="p-3 text-right">
                      {isPrincipal && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(item._id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    No items found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Inventory Item">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <Label htmlFor="name">Item Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Desks, Science Lab Equipment" />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="category">Category</Label>
              <Select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="condition">Condition</Label>
              <Select id="condition" value={condition} onChange={(e) => setCondition(e.target.value)}>
                {CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="quantity">Quantity</Label>
              <Input id="quantity" type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="purchasePrice">Purchase Price (KES)</Label>
              <Input id="purchasePrice" type="number" min="0" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div>
            <Label htmlFor="location">Location</Label>
            <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Store A, Lab 2" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit">Add Item</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
