import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import { Download, RefreshCcw, ExternalLink, Copy } from "lucide-react";
import { toast } from "sonner";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5001";
const DEMO_FLAG = (new URLSearchParams(window.location.search).get("demo") === "1") ||
                  (import.meta.env.VITE_DEMO_MODE === "1");

type Amount = { value: string; assetCode: string; assetScale: number };
type IncomingPayment = {
  id: string;
  walletAddress: string;
  completed: boolean;
  incomingAmount?: Amount;
  receivedAmount: Amount;
  expiresAt?: string;
  metadata?: Record<string, any>;
  createdAt: string;
};

type Page<T> = {
  pagination: {
    startCursor?: string;
    endCursor?: string;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  result: T[];
};

// -------------------- Helpers de formato --------------------
function fmtAmount(a?: Amount) {
  if (!a) return "-";
  const s = (a.value || "0").padStart(a.assetScale + 1, "0");
  const head = s.slice(0, s.length - a.assetScale) || "0";
  const tail = s.slice(-a.assetScale).padEnd(a.assetScale, "0");
  return `${head}${a.assetScale ? "." : ""}${tail} ${a.assetCode}`;
}

// -------------------- DEMO: generador de datos falsos --------------------
const DEMO_ASSET_CODE = "MXN";
const DEMO_ASSET_SCALE = 2;

function toScaledInt(n: number, scale = DEMO_ASSET_SCALE) {
  return String(Math.round(n * Math.pow(10, scale)));
}
function mkAmount(n: number, assetCode = DEMO_ASSET_CODE, assetScale = DEMO_ASSET_SCALE): Amount {
  return { value: toScaledInt(n, assetScale), assetCode, assetScale };
}
function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function dayOffset(d: number) {
  const t = new Date();
  t.setDate(t.getDate() - d);
  return t;
}

const DEMO_TOTAL = 80;
const DEMO_INCOMING: IncomingPayment[] = Array.from({ length: DEMO_TOTAL }).map((_, i) => {
  // Fechas repartidas en los últimos 14 días, varias hoy
  const created = new Date(dayOffset(Math.floor(i / 6))).toISOString();
  const target = Math.round(rand(80, 350)); // objetivo
  // 70% completados, 20% parciales, 10% 0
  const roll = Math.random();
  const received =
    roll < 0.1 ? 0 : roll < 0.3 ? Math.round(target * rand(0.25, 0.75)) : target;

  return {
    id: `https://rafiki.demo/incoming/${i.toString().padStart(4, "0")}`,
    walletAddress: "https://ilp.interledger-test.dev/interpyme",
    completed: received >= target,
    incomingAmount: mkAmount(target),
    receivedAmount: mkAmount(received),
    createdAt: created,
    expiresAt: Math.random() < 0.2 ? new Date(dayOffset(-1)).toISOString() : undefined,
    metadata: { description: "POS Open Payments (DEMO)", ticket: `#${(1000 + i)}` },
  };
});

function encodeCursor(n: number) {
  return btoa(String(n));
}
function decodeCursor(c?: string) {
  if (!c) return 0;
  const s = atob(String(c));
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function paginate<T>(items: T[], first: number, cursor?: string): Page<T> {
  const start = decodeCursor(cursor);
  const slice = items.slice(start, start + first);
  const hasNext = start + first < items.length;
  const hasPrev = start > 0;
  return {
    pagination: {
      startCursor: hasPrev ? encodeCursor(Math.max(0, start - first)) : undefined,
      endCursor: hasNext ? encodeCursor(start + first) : undefined,
      hasNextPage: hasNext,
      hasPreviousPage: hasPrev,
    },
    result: slice,
  };
}

// -------------------- Componente --------------------
const Ventas: React.FC = () => {
  const [data, setData] = useState<Page<IncomingPayment> | null>(null);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [first, setFirst] = useState(20);
  const [query, setQuery] = useState("");
  const [usingDemo, setUsingDemo] = useState(DEMO_FLAG);

  const rows = useMemo(() => {
    let r = data?.result || [];
    if (query.trim()) {
      const q = query.toLowerCase();
      r = r.filter(
        (x) =>
          x.id.toLowerCase().includes(q) ||
          (x.metadata && JSON.stringify(x.metadata).toLowerCase().includes(q))
      );
    }
    return r;
  }, [data, query]);

  const assetScale = rows[0]?.receivedAmount?.assetScale ?? DEMO_ASSET_SCALE;
  const assetCode = rows[0]?.receivedAmount?.assetCode ?? DEMO_ASSET_CODE;

  const fmtInt = (v: number) => {
    const s = String(v).padStart(assetScale + 1, "0");
    const head = s.slice(0, s.length - assetScale) || "0";
    const tail = s.slice(-assetScale).padEnd(assetScale, "0");
    return `${head}${assetScale ? "." : ""}${tail} ${assetCode}`;
  };

  const totalHoy = useMemo(() => {
    const today = new Date().toDateString();
    return rows
      .filter((r) => new Date(r.createdAt).toDateString() === today && r.receivedAmount)
      .reduce((acc, r) => acc + Number(r.receivedAmount.value || "0"), 0);
  }, [rows]);

  const fetchPage = async (c?: string) => {
    if (usingDemo) {
      setData(paginate(DEMO_INCOMING, first, c));
      setCursor(c);
      return;
    }
    try {
      setLoading(true);
      const url = new URL(`${API_URL}/op/incoming`);
      url.searchParams.set("first", String(first));
      if (c) url.searchParams.set("cursor", c);
      const resp = await fetch(url.toString());
      if (!resp.ok) {
        // Fallback a DEMO si el backend falla (404/5xx/403)
        setUsingDemo(true);
        setData(paginate(DEMO_INCOMING, first, c));
        setCursor(c);
        toast("Mostrando datos demo (backend no disponible).");
        return;
      }
      const json = await resp.json();
      setData(json);
      setCursor(c);
    } catch (e: any) {
      setUsingDemo(true);
      setData(paginate(DEMO_INCOMING, first, c));
      setCursor(c);
      toast("Mostrando datos demo por error de red.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPage(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first, usingDemo]);

  const exportCSV = () => {
    const header = ["fecha", "id", "estado", "objetivo", "recibido", "walletAddress"];
    const lines = (data?.result || []).map((r) =>
      [
        new Date(r.createdAt).toISOString(),
        r.id,
        r.completed ? "completed" : "pending",
        fmtAmount(r.incomingAmount),
        fmtAmount(r.receivedAmount),
        r.walletAddress,
      ].join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventas${usingDemo ? "-demo" : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      toast("Copiado");
    } catch {}
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>Ventas</span>
              {usingDemo && <Badge variant="secondary">DEMO</Badge>}
            </div>
            <div className="flex gap-2 items-center">
              <Input
                placeholder="Buscar ID o metadata…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-56"
              />
              <Input
                type="number"
                min={5}
                max={100}
                value={first}
                onChange={(e) => setFirst(Number(e.target.value || 20))}
                className="w-24"
              />
              <Button variant="outline" onClick={() => fetchPage(cursor)} disabled={loading} className="gap-2">
                <RefreshCcw className="h-4 w-4" />
                Actualizar
              </Button>
              <Button onClick={exportCSV} className="gap-2">
                <Download className="h-4 w-4" />
                CSV
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-slate-600 mb-3">
            Total de hoy:&nbsp;
            <Badge variant="secondary">{fmtInt(totalHoy)}</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-2">Fecha</th>
                  <th className="py-2">ID</th>
                  <th className="py-2">Estado</th>
                  <th className="py-2">Objetivo</th>
                  <th className="py-2">Recibido</th>
                  <th className="py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {(rows).map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-2">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="py-2 max-w-[280px] truncate" title={r.id}>
                      {r.id}
                    </td>
                    <td className="py-2">
                      <Badge variant={r.completed ? "default" : "secondary"}>
                        {r.completed ? "COMPLETED" : "PENDING"}
                      </Badge>
                    </td>
                    <td className="py-2">{fmtAmount(r.incomingAmount)}</td>
                    <td className="py-2 font-medium">{fmtAmount(r.receivedAmount)}</td>
                    <td className="py-2">
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copy(r.id)}
                          className="h-8 px-2"
                          title="Copiar ID"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <a
                          href={r.id}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 items-center px-2 border rounded-md"
                          title="Abrir recurso"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className="py-6 text-slate-500" colSpan={6}>Sin resultados</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Separator className="my-3" />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={!data?.pagination?.hasPreviousPage}
              onClick={() => fetchPage(data?.pagination?.startCursor)}
            >
              ← Anteriores
            </Button>
            <Button
              variant="outline"
              disabled={!data?.pagination?.hasNextPage}
              onClick={() => fetchPage(data?.pagination?.endCursor)}
            >
              Siguientes →
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Ventas;
