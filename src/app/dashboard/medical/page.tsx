"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Plus, Stethoscope, AlertTriangle, Package } from "lucide-react";
import { toast } from "sonner";

export default function MedicalPage() {
  const school = useSchool();
  const [tab, setTab] = useState<"supplies" | "vaccinations">("supplies");
  const [showAdd, setShowAdd] = useState(false);

  const supplies = useQuery(
    api.medical.listSupplies,
    school ? { schoolId: school._id } : "skip"
  );
  const vaccinations = useQuery(
    api.medical.listVaccinationsBySchool,
    school ? { schoolId: school._id } : "skip"
  );

  const createSupply = useMutation(api.medical.createSupply);
  const restock = useMutation(api.medical.restock);
  const createVaccination = useMutation(api.medical.createVaccination);

  // Supply form
  const [supplyName, setSupplyName] = useState("");
  const [supplyCategory, setSupplyCategory] = useState("medicine");
  const [supplyQty, setSupplyQty] = useState("0");
  const [supplyUnit, setSupplyUnit] = useState("pieces");
  const [supplyMinStock, setSupplyMinStock] = useState("10");

  // Vaccination form
  const [studentId, setStudentId] = useState("");
  const [vaccineName, setVaccineName] = useState("");
  const [vaccineDate, setVaccineDate] = useState("");

  const students = useQuery(
    api.students.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );

  async function handleCreateSupply(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !supplyName.trim()) return;
    try {
      await createSupply({
        schoolId: school._id,
        name: supplyName.trim(),
        category: supplyCategory,
        quantity: parseInt(supplyQty),
        unit: supplyUnit,
        minStock: parseInt(supplyMinStock),
      });
      toast.success("Supply added");
      setShowAdd(false);
      setSupplyName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  if (!school) {
    return (
      <div className="flex items-center justify-center p-16">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  const lowStockCount = supplies?.filter((s) => s.quantity <= s.minStock).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Medical</h1>
          <p className="text-muted-foreground text-sm">Medical supplies and vaccination records</p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          {tab === "supplies" ? "Add Supply" : "Record Vaccination"}
        </Button>
      </div>

      {lowStockCount > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            <p className="text-sm text-orange-800">
              <strong>{lowStockCount}</strong> medical {lowStockCount === 1 ? "supply is" : "supplies are"} below minimum stock level.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["supplies", "vaccinations"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "supplies" ? "Medical Supplies" : "Vaccinations"}
          </button>
        ))}
      </div>

      {/* Supplies */}
      {tab === "supplies" && (
        <div className="space-y-3">
          {supplies === undefined ? (
            <div className="flex items-center justify-center p-8"><BrandLoader variant="book" size="md" /></div>
          ) : supplies.length === 0 ? (
            <Card className="border-dashed"><CardContent className="p-8 text-center text-muted-foreground text-sm"><Package className="h-10 w-10 mx-auto mb-3 opacity-50" />No medical supplies yet.</CardContent></Card>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/5">
                  <tr>
                    <th className="text-left p-2.5 font-medium">Name</th>
                    <th className="text-left p-2.5 font-medium">Category</th>
                    <th className="text-right p-2.5 font-medium">Qty</th>
                    <th className="text-right p-2.5 font-medium">Min Stock</th>
                    <th className="text-left p-2.5 font-medium">Status</th>
                    <th className="text-right p-2.5 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {supplies.map((s) => (
                    <tr key={s._id} className="border-t border-border">
                      <td className="p-2.5 font-medium">{s.name}</td>
                      <td className="p-2.5 text-muted-foreground">{s.category}</td>
                      <td className="p-2.5 text-right">{s.quantity} {s.unit}</td>
                      <td className="p-2.5 text-right">{s.minStock}</td>
                      <td className="p-2.5">
                        {s.quantity <= s.minStock ? (
                          <Badge variant="danger">Low Stock</Badge>
                        ) : (
                          <Badge variant="success">OK</Badge>
                        )}
                      </td>
                      <td className="p-2.5 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            const qty = prompt("Add quantity:");
                            if (qty && !isNaN(parseInt(qty))) {
                              try { await restock({ id: s._id, addQuantity: parseInt(qty) }); toast.success("Restocked"); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                            }
                          }}
                        >
                          Restock
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Vaccinations */}
      {tab === "vaccinations" && (
        <div className="space-y-3">
          {vaccinations === undefined ? (
            <div className="flex items-center justify-center p-8"><BrandLoader variant="book" size="md" /></div>
          ) : vaccinations.length === 0 ? (
            <Card className="border-dashed"><CardContent className="p-8 text-center text-muted-foreground text-sm"><Stethoscope className="h-10 w-10 mx-auto mb-3 opacity-50" />No vaccination records yet.</CardContent></Card>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/5">
                  <tr>
                    <th className="text-left p-2.5 font-medium">Vaccine</th>
                    <th className="text-left p-2.5 font-medium">Date</th>
                    <th className="text-left p-2.5 font-medium">Batch</th>
                    <th className="text-left p-2.5 font-medium">Next Due</th>
                  </tr>
                </thead>
                <tbody>
                  {vaccinations.map((v) => (
                    <tr key={v._id} className="border-t border-border">
                      <td className="p-2.5 font-medium">{v.vaccineName}</td>
                      <td className="p-2.5 text-muted-foreground">{new Date(v.dateGiven).toLocaleDateString()}</td>
                      <td className="p-2.5 text-muted-foreground">{v.batchNumber ?? "—"}</td>
                      <td className="p-2.5 text-muted-foreground">{v.nextDueDate ? new Date(v.nextDueDate).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={tab === "supplies" ? "Add Medical Supply" : "Record Vaccination"}>
        {tab === "supplies" ? (
          <form onSubmit={handleCreateSupply} className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={supplyName} onChange={(e) => setSupplyName(e.target.value)} required placeholder="e.g. Paracetamol, Bandages" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select value={supplyCategory} onChange={(e) => setSupplyCategory(e.target.value)}>
                  <option value="medicine">Medicine</option>
                  <option value="first_aid">First Aid</option>
                  <option value="equipment">Equipment</option>
                  <option value="other">Other</option>
                </Select>
              </div>
              <div>
                <Label>Unit</Label>
                <Input value={supplyUnit} onChange={(e) => setSupplyUnit(e.target.value)} placeholder="pieces, bottles, etc." />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantity</Label>
                <Input type="number" min="0" value={supplyQty} onChange={(e) => setSupplyQty(e.target.value)} />
              </div>
              <div>
                <Label>Min Stock</Label>
                <Input type="number" min="0" value={supplyMinStock} onChange={(e) => setSupplyMinStock(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit">Add Supply</Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Select a student and vaccine details to record a vaccination.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
