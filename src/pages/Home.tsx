import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  QrCode,
  CreditCard,
  Copy as CopyIcon,
  ExternalLink,
  RefreshCcw,
  Wallet,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Clock,
  Info,
  AlertCircle,
} from "lucide-react";

import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";
import { Separator } from "../components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Toaster, toast } from "sonner";

import { supabase } from "../lib/supabaseClient"; // Asegúrate de que esta ruta sea correcta

const API_URL = import.meta.env.VITE_API_URL || 'https://interpyme00.onrender.com';
const FINISH_URL = `${window.location.origin}/complete`;

type CartItem = { 
  id?: number;
  sku: string; 
  name: string; 
  unitPrice: number; 
  qty: number; 
  image: string; 
};

type Amount = { value: string; assetCode: string; assetScale: number };
type StatusInfo = {
  id: string;
  state: string;
  walletAddress: string;
  receivedAmount: Amount | null;
  incomingAmount: Amount | null;
  completed: boolean;
  expiresAt?: string | null;
  metadata?: Record<string, any> | null;
};

type ProductoSupabase = {
  id: number;
  nombre: string;
  cantidad: number;
  precio_compra: number;
  precio_venta: number;
  imagen_url?: string | null;
  fecha_creacion: string;
  fecha_actualizacion: string;
};

const DEMO_PRODUCTS: CartItem[] = [
  {
    sku: "TORT",
    name: "Coca Cola",
    unitPrice: 18,
    qty: 1,
    image: "https://via.placeholder.com/300x200?text=Coca+Cola",
  },
  {
    sku: "LECH",
    name: "Nito",
    unitPrice: 20,
    qty: 1,
    image: "https://via.placeholder.com/300x200?text=Nito",
  },
  {
    sku: "HUEV",
    name: "Panditas",
    unitPrice: 25,
    qty: 1,
    image: "https://via.placeholder.com/300x200?text=Panditas",
  },
  {
    sku: "CARB",
    name: "Gelatina",
    unitPrice: 15,
    qty: 1,
    image: "https://via.placeholder.com/300x200?text=Gelatina",
  },
];

function useQuery() {
  return useMemo(() => new URLSearchParams(window.location.search), []);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function fmtCurrency(n: number, ccy = "MXN") {
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: ccy }).format(n);
  } catch {
    return `${n.toFixed(2)} ${ccy}`;
  }
}

function fmtAmount(a: Amount | null) {
  if (!a) return "0";
  const scale = Number(a.assetScale || 0);
  const v = a.value || "0";
  const s = v.padStart(scale + 1, "0");
  const head = s.slice(0, s.length - scale) || "0";
  const tail = s.slice(-scale).padEnd(scale, "0");
  return `${head}${scale > 0 ? "." : ""}${tail} ${a.assetCode}`;
}

function normalizePointer(input: string) {
  const s = (input || "").trim();
  if (!s) return s;
  if (s.startsWith("$")) {
    return `https://${s.slice(1)}`;
  }
  return s;
}

async function generateQRDataURL(text: string): Promise<string> {
  try {
    const mod: any = await import("qrcode");
    const url: string = await mod.toDataURL(text, { margin: 1, scale: 6 });
    return url;
  } catch {
    return "";
  }
}

const Row = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`flex items-center justify-between ${className}`}>{children}</div>
);

const notify = (o: { title?: string; description?: string; variant?: "destructive" } | string) => {
  if (typeof o === "string") {
    toast(o);
    return;
  }
  const { title, description, variant } = o;
  if (variant === "destructive") {
    toast.error(title ?? description ?? "");
    return;
  }
  if (title && description) toast(title, { description });
  else toast(description ?? title ?? "");
};

const Home: React.FC = () => {
  const qs = useQuery();

  const [merchantWalletAddressUrl, setMerchantWalletAddressUrl] = useState<string>("");
  const [mode, setMode] = useState<"qr" | "checkout" | "tarjeta">("checkout");
  const [catalog, setCatalog] = useState<CartItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [taxRate] = useState<number>(0.16);
  const currency = "MXN";
  const [orderId, setOrderId] = useState<string>("");
  const [paymentUrl, setPaymentUrl] = useState<string>("");
  const [paymentUrlQR, setPaymentUrlQR] = useState<string>("");
  const [cardQR, setCardQR] = useState<string>("");
  const [cardQrLoading, setCardQrLoading] = useState<boolean>(false);
  const [interactRedirect, setInteractRedirect] = useState<string>("");
  const [customerPointer, setCustomerPointer] = useState<string>("");
  const [statusInfo, setStatusInfo] = useState<StatusInfo | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [qrLoading, setQrLoading] = useState<boolean>(false);
  const [loadingProducts, setLoadingProducts] = useState<boolean>(true);
  const timerRef = useRef<number | null>(null);

  const cardUrl = merchantWalletAddressUrl
    ? `https://pay.interledger-test.dev/payment-choice?receiver=${encodeURIComponent(merchantWalletAddressUrl)}`
    : "";

  // Cargar productos desde Supabase
  useEffect(() => {
    const fetchProductos = async () => {
      setLoadingProducts(true);
      try {
        const { data, error } = await supabase
          .from("productos")
          .select("*, imagen_url")
          .order("nombre", { ascending: true });
        
        if (error) {
          console.error("Error al cargar productos:", error);
          notify({ 
            title: "Error cargando productos", 
            description: "Se usarán productos de demostración", 
            variant: "destructive" 
          });
          setCatalog(DEMO_PRODUCTS);
          setLoadingProducts(false);
          return;
        }

        if (data && data.length > 0) {
          const productosMapeados: CartItem[] = data.map((p: ProductoSupabase) => ({
            id: p.id,
            sku: `SKU${p.id}`,
            name: p.nombre,
            unitPrice: Number(p.precio_venta),
            qty: 1,
            image: p.imagen_url || "https://via.placeholder.com/300x200?text=Sin+imagen",
          }));
          setCatalog(productosMapeados);
          notify({ description: `${data.length} productos cargados desde inventario` });
        } else {
          setCatalog(DEMO_PRODUCTS);
          notify({ description: "No hay productos en inventario, usando demostración" });
        }
      } catch (error) {
        console.error("Error inesperado:", error);
        setCatalog(DEMO_PRODUCTS);
        notify({ 
          title: "Error de conexión", 
          description: "Usando productos de demostración", 
          variant: "destructive" 
        });
      } finally {
        setLoadingProducts(false);
      }
    };

    fetchProductos();
  }, []);

  // Cargar configuración del merchant
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`${API_URL}/config`);
        if (!resp.ok) return;
        const data = await resp.json();
        setMerchantWalletAddressUrl(data.merchantWalletAddressUrl || "");
      } catch (error) {
        console.error("Error cargando configuración:", error);
      }
    })();
  }, []);

  // Generar QR para tarjeta
  useEffect(() => {
    if (cardUrl) {
      setCardQrLoading(true);
      generateQRDataURL(cardUrl).then((qr) => {
        setCardQR(qr);
        setCardQrLoading(false);
      }).catch(() => setCardQrLoading(false));
    }
  }, [cardUrl]);

  // Auto-refresh del estado de la orden
  useEffect(() => {
    if (!autoRefresh || !orderId) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    const t = window.setInterval(() => {
      if (orderId) fetchOrderStatus(orderId, false);
    }, 3000);
    timerRef.current = t;
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [autoRefresh, orderId]);

  const safeParseJson = async (resp: Response) => {
    const ct = resp.headers.get("content-type") || "";
    if (ct.includes("application/json")) return await resp.json();
    const txt = await resp.text();
    try {
      return JSON.parse(txt);
    } catch {
      return { _raw: txt };
    }
  };

  // Verificar stock antes de agregar al carrito
  const addToCart = async (p: CartItem) => {
    if (p.id) {
      try {
        const { data } = await supabase
          .from("productos")
          .select("cantidad")
          .eq("id", p.id)
          .single();
        
        if (data && data.cantidad <= 0) {
          notify({ 
            title: "Sin stock", 
            description: `${p.name} no tiene existencias disponibles`, 
            variant: "destructive" 
          });
          return;
        }
      } catch (error) {
        console.error("Error verificando stock:", error);
      }
    }

    setCart((prev) => {
      const idx = prev.findIndex((x) => (x.id || x.sku) === (p.id || p.sku));
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
        return copy;
      }
      return [...prev, { ...p }];
    });
    notify({ description: `${p.name} agregado al carrito` });
  };

  const decQty = (skuOrId: string | number) => {
    setCart((prev) => 
      prev.map((x) => {
        const itemKey = x.id || x.sku;
        if (itemKey === skuOrId) {
          return { ...x, qty: Math.max(1, x.qty - 1) };
        }
        return x;
      })
    );
  };

  const incQty = (skuOrId: string | number) => {
    setCart((prev) => 
      prev.map((x) => {
        const itemKey = x.id || x.sku;
        if (itemKey === skuOrId) {
          return { ...x, qty: x.qty + 1 };
        }
        return x;
      })
    );
  };

  const removeItem = (skuOrId: string | number) => {
    const item = cart.find((x) => (x.id || x.sku) === skuOrId);
    setCart((prev) => prev.filter((x) => (x.id || x.sku) !== skuOrId));
    if (item) {
      notify({ description: `${item.name} eliminado`, variant: "destructive" });
    }
  };

  const subtotal = round2(cart.reduce((acc, it) => acc + it.unitPrice * it.qty, 0));
  const tax = round2(subtotal * taxRate);
  const total = round2(subtotal + tax);

  // Actualizar inventario después de pago exitoso
  const actualizarInventario = async (itemsVendidos: CartItem[]) => {
    try {
      for (const item of itemsVendidos) {
        const productoId = item.id;
        if (productoId && item.qty > 0) {
          // Actualizar stock directamente
          const { error } = await supabase
            .from("productos")
            .update({ 
              cantidad: supabase.raw('cantidad - ?', [item.qty]),
              fecha_actualizacion: new Date().toISOString()
            })
            .eq("id", productoId);
          
          if (error) {
            console.error(`Error actualizando stock del producto ${productoId}:`, error);
            notify({ 
              title: "Advertencia", 
              description: `No se pudo actualizar el stock de ${item.name}`, 
              variant: "destructive" 
            });
          }
        }
      }
      notify({ description: "Inventario actualizado correctamente" });
    } catch (error) {
      console.error("Error actualizando inventario:", error);
      notify({ 
        title: "Error de inventario", 
        description: "No se pudo actualizar el stock", 
        variant: "destructive" 
      });
    }
  };

  const createOrder = async () => {
    try {
      setLoading(true);
      setError("");
      setStatusInfo(null);
      setOrderId("");
      setPaymentUrl("");
      setPaymentUrlQR("");
      setInteractRedirect("");

      if (cart.length === 0) {
        setError("Agrega productos al carrito.");
        notify({
          title: "Carrito vacío",
          description: "Agrega productos para crear la orden",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const resp = await fetch(`${API_URL}/pos/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          items: cart.map(item => ({
            ...item,
            sku: item.id ? `SKU${item.id}` : item.sku // Asegurar SKU consistente
          })), 
          taxRate, 
          currency, 
          finishUrl: FINISH_URL 
        }),
      });

      const data = await safeParseJson(resp);
      if (!resp.ok) {
        if (data.interactRedirect) {
          setInteractRedirect(data.interactRedirect);
          setError("Se requiere aprobación del comercio (haz clic en el enlace), luego reintenta crear la orden.");
          notify({ title: "Permisos requeridos", description: "Abre el enlace para autorizar al comercio." });
          setLoading(false);
          return;
        }
        throw new Error(data.error || "No se pudo crear la orden");
      }

      setOrderId(data.orderId);
      setPaymentUrl(data.paymentUrl);
      setQrLoading(true);
      const qr = await generateQRDataURL(data.paymentUrl);
      setPaymentUrlQR(qr);
      setQrLoading(false);
      fetchOrderStatus(data.orderId, false);
      notify({ title: "Orden creada", description: `#${String(data.orderId).slice(0, 8)} lista para cobrar` });
    } catch (e) {
      const msg = (e as Error).message;
      setError("Error creando orden: " + msg);
      notify({ title: "Error creando orden", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderStatus = async (id: string, showErrors = true) => {
    try {
      const resp = await fetch(`${API_URL}/pos/order-status?orderId=${encodeURIComponent(id)}`);
      const data = await safeParseJson(resp);
      if (!resp.ok) {
        console.error("order-status fail:", resp.status, data);
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      
      setStatusInfo(data.status);
      
      if (data.status?.completed || data.status?.state === "completed") {
        setAutoRefresh(false);
        notify({ title: "¡Pago completado!", description: "El cobro fue acreditado ✅" });
        
        // Actualizar inventario solo si hay productos en el carrito
        if (cart.length > 0) {
          await actualizarInventario(cart);
          
          // Recargar catálogo actualizado
          const { data: productosData } = await supabase
            .from("productos")
            .select("*, imagen_url")
            .order("nombre", { ascending: true });
          
          if (productosData) {
            const productosMapeados: CartItem[] = productosData.map((p: ProductoSupabase) => ({
              id: p.id,
              sku: `SKU${p.id}`,
              name: p.nombre,
              unitPrice: Number(p.precio_venta),
              qty: 1,
              image: p.imagen_url || "https://via.placeholder.com/300x200?text=Sin+imagen",
            }));
            setCatalog(productosMapeados);
          }
          
          // Limpiar carrito después de pago exitoso
          setCart([]);
        }
      }
    } catch (e) {
      console.error(e);
      if (showErrors) {
        const msg = (e as Error).message;
        setError("No se pudo consultar el estado: " + msg);
        notify({ title: "Error de estado", description: msg, variant: "destructive" });
      }
    }
  };

  const startCheckout = async () => {
    try {
      setError("");
      if (!orderId || !paymentUrl) {
        const m = "Primero crea la orden.";
        setError(m);
        notify({ description: m, variant: "destructive" });
        return;
      }
      if (!customerPointer.trim()) {
        const m = "Ingresa el Payment Pointer del cliente (ej: $ilp.interledger-test.dev/alice).";
        setError(m);
        notify({ description: m, variant: "destructive" });
        return;
      }

      const pointer = normalizePointer(customerPointer);
      if (merchantWalletAddressUrl && pointer.toLowerCase() === merchantWalletAddressUrl.trim().toLowerCase()) {
        const m = "El payment pointer del cliente no puede ser el mismo que el del comercio.";
        setError(m);
        notify({ description: m, variant: "destructive" });
        return;
      }

      const resp = await fetch(`${API_URL}/checkout/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          customerWalletAddressUrl: pointer, 
          receiverPaymentUrl: paymentUrl, 
          finishUrl: FINISH_URL 
        }),
      });

      const data = await safeParseJson(resp);
      if (!resp.ok) throw new Error(data.error || "No se pudo iniciar el checkout");

      if (data.checkoutId) {
        window.sessionStorage.setItem("checkoutId", data.checkoutId);
        window.localStorage.setItem("checkoutId", data.checkoutId);
      }

      if (data.interactRedirect) {
        window.location.href = data.interactRedirect;
      } else {
        setError("No se recibió un redirect de interacción.");
        notify({ description: "No se recibió un redirect de interacción.", variant: "destructive" });
      }
    } catch (e) {
      const msg = (e as Error).message;
      setError("Error iniciando checkout: " + msg);
      notify({ title: "Error iniciando checkout", description: msg, variant: "destructive" });
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify("Copiado al portapapeles");
    } catch {
      notify({ description: "Error copiando", variant: "destructive" });
    }
  };

  // Verificar parámetro de pago completado
  useEffect(() => {
    const paid = qs.get("paid");
    if (paid === "1") {
      notify({ title: "Pago autorizado", description: "Verifica el estado de la orden" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [qs]);

  const showCreateMessage = (!orderId || !paymentUrl) && mode !== "tarjeta";

  const getItemKey = (item: CartItem) => item.id || item.sku;

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gradient-to-b from-white to-slate-50">
        <Toaster />
        <header className="sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-white/70 bg-white/90 border-b">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
            <div className="size-9 rounded-xl bg-indigo-600 text-white grid place-items-center shadow-sm">
              <Wallet className="size-5" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-semibold text-slate-900 leading-none">POS · Open Payments</h1>
              <p className="text-sm text-slate-600 leading-tight mt-0.5">
                {loadingProducts ? "Cargando inventario..." : "Cobra con QR o checkout guiado"}
              </p>
            </div>
            <Badge variant="secondary" className="hidden sm:inline-flex gap-1 items-center">
              <ShieldCheck className="size-4" />
              <span className="truncate max-w-[240px]" title={merchantWalletAddressUrl}>
                {merchantWalletAddressUrl || "Configurando wallet..."}
              </span>
            </Badge>
          </div>
        </header>

        <main className="mx-auto max-w-6xl p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6">
          {/* Columna izquierda */}
          <div className="space-y-6">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="size-5" /> 
                  Catálogo {loadingProducts && <Loader2 className="size-4 animate-spin" />}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingProducts ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-6 animate-spin mr-2" />
                    Cargando productos...
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {catalog.map((p) => (
                      <motion.div 
                        key={getItemKey(p)} 
                        layout 
                        initial={{ opacity: 0, y: 6 }} 
                        animate={{ opacity: 1, y: 0 }}
                        className="group"
                      >
                        <div className="group rounded-2xl border bg-white hover:shadow-sm transition-shadow p-4 h-full flex flex-col">
                          <div className="w-full h-32 rounded-lg overflow-hidden mb-3 bg-gray-100">
                            <img
                              src={p.image}
                              alt={p.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.src = "https://via.placeholder.com/300x200?text=Sin+imagen";
                              }}
                            />
                          </div>
                          <div className="font-medium text-slate-900">{p.name}</div>
                          <div className="text-sm text-slate-600 mt-0.5">
                            {fmtCurrency(p.unitPrice, currency)}
                          </div>
                          <div className="mt-auto">
                            <Button 
                              variant="secondary" 
                              className="w-full gap-2 mt-3" 
                              onClick={() => addToCart(p)}
                            >
                              <Plus className="size-4" /> Agregar
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle>Carrito</CardTitle>
              </CardHeader>
              <CardContent>
                {cart.length === 0 ? (
                  <div className="text-center py-8 text-slate-600">
                    <ShoppingCart className="size-12 mx-auto mb-4 opacity-50" />
                    Tu carrito está vacío. Agrega productos del catálogo.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 text-xs text-slate-500 px-1">
                      <div>Producto</div>
                      <div className="text-center">Precio</div>
                      <div className="text-center">Cantidad</div>
                      <div className="text-right">Importe</div>
                      <div className="text-right">Acciones</div>
                    </div>
                    <Separator />
                    <AnimatePresence initial={false}>
                      {cart.map((item) => (
                        <motion.div
                          key={getItemKey(item)}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          className="grid grid-cols-[1fr] sm:grid-cols-[1fr_auto_auto_auto_auto] gap-3 items-center"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                              <img
                                src={item.image}
                                alt={item.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.src = "https://via.placeholder.com/48?text=?";
                                }}
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900 truncate">{item.name}</div>
                              <div className="sm:hidden text-sm text-slate-600">
                                {fmtCurrency(item.unitPrice, currency)}
                              </div>
                            </div>
                          </div>
                          <div className="hidden sm:block text-center text-slate-900">
                            {fmtCurrency(item.unitPrice, currency)}
                          </div>
                          <div className="flex items-center justify-between sm:justify-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => decQty(getItemKey(item))}
                            >
                              <Minus className="size-4" />
                            </Button>
                            <span className="w-8 text-center font-medium text-slate-900">{item.qty}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => incQty(getItemKey(item))}
                            >
                              <Plus className="size-4" />
                            </Button>
                          </div>
                          <div className="text-right font-medium text-slate-900">
                            {fmtCurrency(item.unitPrice * item.qty, currency)}
                          </div>
                          <div className="flex sm:justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:bg-red-50"
                              onClick={() => removeItem(getItemKey(item))}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    <div className="mt-4 border rounded-2xl p-4 bg-slate-50/50">
                      <div className="space-y-1.5">
                        <Row>
                          <span className="text-slate-600">Subtotal</span>
                          <span className="text-slate-900">{fmtCurrency(subtotal, currency)}</span>
                        </Row>
                        <Row>
                          <span className="text-slate-600">IVA ({Math.round(taxRate * 100)}%)</span>
                          <span className="text-slate-900">{fmtCurrency(tax, currency)}</span>
                        </Row>
                        <Separator className="my-1" />
                        <Row>
                          <span className="font-semibold text-slate-900">Total</span>
                          <span className="font-semibold text-slate-900 text-lg">
                            {fmtCurrency(total, currency)}
                          </span>
                        </Row>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-4">
                      <Tabs
                        value={mode}
                        onValueChange={(v: string) => setMode(v as "qr" | "checkout" | "tarjeta")}
                        className="w-full sm:w-auto"
                      >
                        <TabsList className="grid grid-cols-3 w-full sm:w-[360px]">
                          <TabsTrigger value="qr" className="gap-2">
                            <QrCode className="size-4" /> QR
                          </TabsTrigger>
                          <TabsTrigger value="checkout" className="gap-2">
                            <Wallet className="size-4" /> Checkout
                          </TabsTrigger>
                          <TabsTrigger value="tarjeta" className="gap-2">
                            <CreditCard className="size-4" /> Tarjeta
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>

                      <div className="sm:ml-auto">
                        <Button 
                          onClick={createOrder} 
                          disabled={loading || total <= 0 || cart.length === 0}
                          className="gap-2 w-full sm:w-auto"
                        >
                          {loading ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <ShieldCheck className="size-4" />
                          )}
                          {loading ? "Creando…" : `Crear orden $${fmtCurrency(total, currency)}`}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Columna derecha */}
          <div className="space-y-6 lg:sticky lg:top-[72px] h-fit">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Cobro</CardTitle>
                    <p className="text-sm text-slate-600">Genera el link, comparte o escanea.</p>
                  </div>
                  {orderId && (
                    <Badge variant="secondary" className="text-[11px]">
                      # {orderId.slice(0, 8)}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {showCreateMessage ? (
                  <div className="text-sm text-slate-600 text-center py-4">
                    <AlertCircle className="size-5 mx-auto mb-2 opacity-50" />
                    Crea una orden para ver el link de cobro y el QR.
                  </div>
                ) : (
                  <>
                    {mode !== "tarjeta" && (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-slate-500">Link de cobro</div>
                          <a
                            href={paymentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block font-medium text-indigo-700 truncate hover:underline"
                            title={paymentUrl}
                          >
                            {paymentUrl}
                          </a>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => copy(paymentUrl)}>
                                <CopyIcon className="size-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Copiar link</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a
                                href={paymentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center h-9 w-9 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50"
                              >
                                <ExternalLink className="size-4" />
                              </a>
                            </TooltipTrigger>
                            <TooltipContent>Abrir en nueva pestaña</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    )}

                    <Tabs value={mode} onValueChange={(v: string) => setMode(v as "qr" | "checkout" | "tarjeta")}>
                      <TabsList className="grid grid-cols-3">
                        <TabsTrigger value="qr" className="gap-2">
                          <QrCode className="size-4" /> QR
                        </TabsTrigger>
                        <TabsTrigger value="checkout" className="gap-2">
                          <Wallet className="size-4" /> Checkout
                        </TabsTrigger>
                        <TabsTrigger value="tarjeta" className="gap-2">
                          <CreditCard className="size-4" /> Tarjeta
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="qr" className="mt-3">
                        <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                          <div className="w-[180px] h-[180px] rounded-2xl border bg-white grid place-items-center overflow-hidden">
                            {qrLoading ? (
                              <Loader2 className="size-6 animate-spin text-slate-400" />
                            ) : paymentUrlQR ? (
                              <img src={paymentUrlQR} alt="QR para pagar" className="w-[172px] h-[172px]" />
                            ) : (
                              <div className="text-slate-500 text-sm flex flex-col items-center gap-1">
                                <QrCode className="size-8 opacity-50" />
                                <span>QR de pago</span>
                              </div>
                            )}
                          </div>
                          <div className="text-sm text-slate-600">
                            El cliente abre su wallet y escanea el QR para pagar instantáneamente.
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="checkout" className="mt-3">
                        <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                          <div className="grid gap-1.5">
                            <Label htmlFor="pointer">Payment Pointer del cliente</Label>
                            <Input
                              id="pointer"
                              type="text"
                              value={customerPointer}
                              onChange={(e) => setCustomerPointer(e.target.value)}
                              placeholder="$ilp.interledger-test.dev/alice"
                              className="w-full"
                            />
                          </div>
                          <Button variant="secondary" className="gap-2" onClick={startCheckout}>
                            <CreditCard className="size-4" /> Iniciar
                          </Button>
                        </div>
                      </TabsContent>

                      <TabsContent value="tarjeta" className="mt-3 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs text-slate-500">Link de pago con tarjeta</div>
                            <a
                              href={cardUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block font-medium text-indigo-700 truncate hover:underline"
                              title={cardUrl}
                            >
                              {cardUrl || "Configurando..."}
                            </a>
                          </div>
                          {cardUrl && (
                            <div className="flex gap-1.5 shrink-0">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => copy(cardUrl)}>
                                    <CopyIcon className="size-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Copiar</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <a
                                    href={cardUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center h-9 w-9 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50"
                                  >
                                    <ExternalLink className="size-4" />
                                  </a>
                                </TooltipTrigger>
                                <TooltipContent>Abrir</TooltipContent>
                              </Tooltip>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                          <div className="w-[180px] h-[180px] rounded-2xl border bg-white grid place-items-center overflow-hidden">
                            {cardQrLoading ? (
                              <Loader2 className="size-6 animate-spin text-slate-400" />
                            ) : cardQR ? (
                              <img src={cardQR} alt="QR tarjeta" className="w-[172px] h-[172px]" />
                            ) : (
                              <div className="text-slate-500 text-sm flex flex-col items-center gap-1">
                                <CreditCard className="size-8 opacity-50" />
                                <span>QR Tarjeta</span>
                              </div>
                            )}
                          </div>
                          <div className="text-sm text-slate-600">
                            El cliente escanea para pagar con tarjeta vía web.
                          </div>
                        </div>
                      </TabsContent>
                    </Tabs>

                    {mode !== "tarjeta" && interactRedirect && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="text-sm text-amber-800">
                          <AlertCircle className="size-4 inline mr-1" />
                          Necesitas aprobar permisos:&nbsp;
                          <a href={interactRedirect} className="font-medium underline" target="_blank" rel="noopener">
                            Abrir autorización
                          </a>
                        </div>
                      </div>
                    )}

                    {mode !== "tarjeta" && orderId && (
                      <div className="flex flex-wrap items-center gap-3 pt-2">
                        <Button
                          variant="outline"
                          className="gap-2"
                          onClick={() => fetchOrderStatus(orderId, true)}
                          size="sm"
                        >
                          <RefreshCcw className="size-4" /> Ver estado
                        </Button>
                        <div className="flex items-center gap-2">
                          <Switch
                            id="autorefresh"
                            checked={autoRefresh}
                            onCheckedChange={(checked) => setAutoRefresh(checked)}
                          />
                          <Label htmlFor="autorefresh" className="text-sm">Auto-refrescar</Label>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Estado del pago */}
            {statusInfo && (
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">Estado del cobro</CardTitle>
                      <div className="text-xs text-slate-500">
                        ID: {statusInfo.id?.split("/").pop()}
                      </div>
                    </div>
                    <Badge 
                      variant={statusInfo.completed ? "default" : "secondary"} 
                      className="gap-1.5"
                    >
                      {statusInfo.completed ? (
                        <CheckCircle2 className="size-4 text-green-500" />
                      ) : (
                        <Info className="size-4" />
                      )}
                      {statusInfo.state?.toUpperCase() || (statusInfo.completed ? "COMPLETADO" : "PENDIENTE")}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-2xl border p-3 bg-green-50">
                      <div className="text-slate-600">Recibido</div>
                      <div className="text-xl font-semibold mt-1 text-green-700">
                        {fmtAmount(statusInfo.receivedAmount)}
                      </div>
                    </div>
                    <div className="rounded-2xl border p-3 bg-blue-50">
                      <div className="text-slate-600">Objetivo</div>
                      <div className="text-xl font-semibold mt-1 text-blue-700">
                        {fmtAmount(statusInfo.incomingAmount)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-2xl border p-3">
                      <div className="text-slate-600">Wallet destino</div>
                      <div className="mt-1 break-all">
                        <a
                          href={statusInfo.walletAddress}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-700 hover:underline text-sm"
                        >
                          {statusInfo.walletAddress}
                        </a>
                      </div>
                    </div>
                    {statusInfo.expiresAt && (
                      <div className="rounded-2xl border p-3">
                        <div className="text-slate-600">Expira</div>
                        <div className="mt-1 text-slate-900 flex items-center gap-2 text-sm">
                          <Clock className="size-4" />
                          {new Date(statusInfo.expiresAt).toLocaleString("es-MX")}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Errores */}
            {error && (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="p-4 text-red-700 text-sm flex items-start gap-2">
                  <AlertCircle className="size-4 mt-0.5 flex-shrink-0" />
                  {error}
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
};

export default Home;