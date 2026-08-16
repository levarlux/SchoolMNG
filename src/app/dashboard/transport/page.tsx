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
import { Plus, Bus, MapPin, Wrench } from "lucide-react";
import { toast } from "sonner";
import { EavRouteWrapper } from "@/components/generic/EavRouteWrapper";

export default function TransportPage() {
  const school = useSchool();
  const [tab, setTab] = useState<"routes" | "logs" | "maintenance">("routes");
  const [showAdd, setShowAdd] = useState(false);

  const routes = useQuery(
    api.transport.listRoutes,
    school ? { schoolId: school._id } : "skip"
  );
  const maintenance = useQuery(
    api.transport.listMaintenance,
    school ? { schoolId: school._id } : "skip"
  );

  const createRoute = useMutation(api.transport.createRoute);
  const createMaintenance = useMutation(api.transport.createMaintenance);

  const [routeName, setRouteName] = useState("");
  const [pickupPoints, setPickupPoints] = useState("");
  const [vehicleReg, setVehicleReg] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [capacity, setCapacity] = useState("30");

  async function handleCreateRoute(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !routeName.trim()) return;
    try {
      await createRoute({
        schoolId: school._id,
        name: routeName.trim(),
        pickupPoints: pickupPoints.split("\n").filter((p) => p.trim()),
        vehicleReg: vehicleReg || undefined,
        driverName: driverName || undefined,
        driverPhone: driverPhone || undefined,
        capacity: parseInt(capacity),
      });
      toast.success("Route created");
      setShowAdd(false);
      setRouteName("");
      setPickupPoints("");
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

  return (
    <EavRouteWrapper moduleName="Transport" bucket="learner">
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Transport</h1>
          <p className="text-muted-foreground text-sm">Routes, logs, and vehicle maintenance</p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Route
        </Button>
      </div>

      <div className="flex gap-1 border-b border-border">
        {(["routes", "logs", "maintenance"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t === "routes" ? "Routes" : t === "logs" ? "Route Logs" : "Maintenance"}
          </button>
        ))}
      </div>

      {tab === "routes" && (
        <div className="space-y-3">
          {routes === undefined ? (
            <div className="flex items-center justify-center p-8"><BrandLoader variant="book" size="md" /></div>
          ) : routes.length === 0 ? (
            <Card className="border-dashed"><CardContent className="p-8 text-center text-muted-foreground text-sm"><Bus className="h-10 w-10 mx-auto mb-3 opacity-50" />No routes yet.</CardContent></Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {routes.map((r) => (
                <Card key={r._id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold">{r.name}</h3>
                      <Badge variant={r.isActive ? "success" : "secondary"}>{r.isActive ? "Active" : "Inactive"}</Badge>
                    </div>
                    {r.driverName && <p className="text-sm text-muted-foreground">Driver: {r.driverName} ({r.driverPhone ?? "—"})</p>}
                    {r.vehicleReg && <p className="text-sm text-muted-foreground">Vehicle: {r.vehicleReg}</p>}
                    <p className="text-sm text-muted-foreground">Capacity: {r.capacity} students</p>
                    {r.pickupPoints.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {r.pickupPoints.map((p, i) => (
                          <Badge key={i} variant="outline" className="text-xs"><MapPin className="h-3 w-3 mr-1" />{p}</Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "maintenance" && (
        <div className="space-y-3">
          {maintenance === undefined ? (
            <div className="flex items-center justify-center p-8"><BrandLoader variant="book" size="md" /></div>
          ) : maintenance.length === 0 ? (
            <Card className="border-dashed"><CardContent className="p-8 text-center text-muted-foreground text-sm"><Wrench className="h-10 w-10 mx-auto mb-3 opacity-50" />No maintenance records.</CardContent></Card>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/5">
                  <tr>
                    <th className="text-left p-2.5 font-medium">Vehicle</th>
                    <th className="text-left p-2.5 font-medium">Service</th>
                    <th className="text-left p-2.5 font-medium">Date</th>
                    <th className="text-right p-2.5 font-medium">Cost</th>
                    <th className="text-left p-2.5 font-medium">Next Service</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenance.map((m) => (
                    <tr key={m._id} className="border-t border-border">
                      <td className="p-2.5 font-medium">{m.vehicleReg}</td>
                      <td className="p-2.5">{m.serviceType}</td>
                      <td className="p-2.5 text-muted-foreground">{new Date(m.date).toLocaleDateString()}</td>
                      <td className="p-2.5 text-right">{m.cost ? `KES ${m.cost.toLocaleString()}` : "—"}</td>
                      <td className="p-2.5 text-muted-foreground">{m.nextServiceDate ? new Date(m.nextServiceDate).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Transport Route">
        <form onSubmit={handleCreateRoute} className="space-y-4">
          <div>
            <Label>Route Name *</Label>
            <Input value={routeName} onChange={(e) => setRouteName(e.target.value)} required placeholder="e.g. Route A - Town Center" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Driver Name</Label>
              <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
            </div>
            <div>
              <Label>Driver Phone</Label>
              <Input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Vehicle Reg</Label>
              <Input value={vehicleReg} onChange={(e) => setVehicleReg(e.target.value)} />
            </div>
            <div>
              <Label>Capacity</Label>
              <Input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Pickup Points (one per line)</Label>
            <textarea value={pickupPoints} onChange={(e) => setPickupPoints(e.target.value)} className="w-full min-h-[80px] rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit">Create Route</Button>
          </div>
        </form>
      </Modal>
    </div>
    </EavRouteWrapper>
  );
}
