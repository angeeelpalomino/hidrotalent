import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Separator } from "../components/ui/separator";
import { Download, RefreshCcw, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5001";
const DEMO_FLAG = (new URLSearchParams(window.location.search).get("demo") === "1") ||
                  (import.meta.env.VITE_DEMO_MODE === "1");

type Amount = { value: string; assetCode: string; assetScale: number };
type OutgoingPayment = {
  id: string;
  walletAddress: string;
  quoteId?: string;
  failed?: boolean;
  receiver: string;
  receiveAmount: Amount;
  debitAmount: Amount;
  sentAmount: Amount;
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

// -------------------- Helpers --------------------
function fmt(a: Amount) {
  const s = (a.value || "0").padStart(a.assetScale + 1, "0");
  const head = s.slice(0, s.length - a.assetScale) || "0";
  const tail = s.slice(-a.assetScale).padEnd(a.assetScale, "0");
  return `${head}${a.assetScale ? "." : ""}${tail} ${a.assetCode}`;
}

// -------------------- DEMO data --------------------
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
const DEMO_OUTGOING: OutgoingPayment[] = Array.from({ length: DEMO_TOTAL }).map((_, i) => {
  const created = new Date(dayOffset(Math.floor(i / 6))).toISOString();
  const debit = Math.round(rand(80, 350));
  // Simulamos pequeñas diferencias por fees
  const sent = debit;
  const receive = Math.max(0, debit - Math.round(rand(0, 8)));
  const failed = Math.random() < 0.12; // ~12% fallidos
  return {
    id: `https://rafiki.demo/outgoing/${i.toString().padStart(4, "0")}`,
    walletAddress: "https://ilp.interledger-test.dev/interpyme",
    receiver: `https://ilp.interledger-test.dev/user${(i % 9) + 1}`,
    failed,
    receiveAmount: mkAmount(receive),
    debitAmount: mkAmount(debit),
    sentAmount: mkAmount(sent),
    createdAt: created,
    metadata: { description: failed ? "Fallo de autorización" : "Pago POS (DEMO)" },
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
const Transacciones: React.FC = () => {
  const [data, setData] = useState<Page<OutgoingPayment> | null>(null);
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
          x.receiver.toLowerCase().includes(q) ||
          (x.metadata && JSON.stringify(x.metadata).toLowerCase().includes(q))
      );
    }
    return r;
  }, [data, query]);

  const assetScale = rows[0]?.debitAmount?.assetScale ?? DEMO_ASSET_SCALE;
  const assetCode = rows[0]?.debitAmount?.assetCode ?? DEMO_ASSET_CODE;

  const sum = (field: "debitAmount" | "sentAmount" | "receiveAmount") =>
    rows.reduce((acc, r) => acc + Number((r as any)[field]?.value || "0"), 0);

  const totals = {
    debit: sum("debitAmount"),
    sent: sum("sentAmount"),
    receive: sum("receiveAmount"),
  };

  const fetchPage = async (c?: string) => {
    if (usingDemo) {
      setData(paginate(DEMO_OUTGOING, first, c));
      setCursor(c);
      return;
    }
    try {
      setLoading(true);
      const url = new URL(`${API_URL}/op/outgoing`);
      url.searchParams.set("first", String(first));
      if (c) url.searchParams.set("cursor", c);
      const resp = await fetch(url.toString());
      if (!resp.ok) {
        setUsingDemo(true);
        setData(paginate(DEMO_OUTGOING, first, c));
        setCursor(c);
        toast("Mostrando datos demo (backend no disponible).");
        return;
      }
      const json = await resp.json();
      setData(json);
      setCursor(c);
    } catch (e: any) {
      setUsingDemo(true);
      setData(paginate(DEMO_OUTGOING, first, c));
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
    const header = ["fecha", "id", "receiver", "failed", "debitAmount", "receiveAmount", "sentAmount", "walletAddress"];
    const lines = (data?.result || []).map((r) =>
      [
        new Date(r.createdAt).toISOString(),
        r.id,
        r.receiver,
        r.failed ? "true" : "false",
        fmt(r.debitAmount),
        fmt(r.receiveAmount),
        fmt(r.sentAmount),
        r.walletAddress,
      ].join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transacciones${usingDemo ? "-demo" : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>Transacciones</span>
              {usingDemo && <Badge variant="secondary">DEMO</Badge>}
            </div>
            <div className="flex gap-2 items-center">
              <Input
                placeholder="Buscar ID/receiver…"
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
              <Button
                variant="outline"
                onClick={() => fetchPage(cursor)}
                disabled={loading}
                className="gap-2"
              >
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
          <div className="text-sm text-slate-600 mb-3 flex gap-3">
            <span>
              Total debit: <b>{fmt({ value: String(totals.debit), assetCode, assetScale })}</b>
            </span>
            <span>
              Total sent: <b>{fmt({ value: String(totals.sent), assetCode, assetScale })}</b>
            </span>
            <span>
              Total receive: <b>{fmt({ value: String(totals.receive), assetCode, assetScale })}</b>
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-2">Fecha</th>
                  <th className="py-2">ID</th>
                  <th className="py-2">Receiver</th>
                  <th className="py-2">Estado</th>
                  <th className="py-2">Debit</th>
                  <th className="py-2">Receive</th>
                  <th className="py-2">Sent</th>
                  <th className="py-2">Ver</th>
                </tr>
              </thead>
              <tbody>
                {(rows).map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-2">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="py-2 max-w-[280px] truncate" title={r.id}>
                      {r.id}
                    </td>
                    <td className="py-2 max-w-[280px] truncate" title={r.receiver}>
                      {r.receiver}
                    </td>
                    <td className="py-2">
                      <Badge variant={r.failed ? "secondary" : "default"}>
                        {r.failed ? "FAILED" : "OK"}
                      </Badge>
                    </td>
                    <td className="py-2">{fmt(r.debitAmount)}</td>
                    <td className="py-2">{fmt(r.receiveAmount)}</td>
                    <td className="py-2 font-medium">{fmt(r.sentAmount)}</td>
                    <td className="py-2">
                      <a
                        href={r.id}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center px-2 border rounded-md"
                        title="Abrir recurso"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className="py-6 text-slate-500" colSpan={8}>Sin resultados</td>
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

export default Transacciones;
