require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder?.('ipv4first');

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const {
  createAuthenticatedClient,
  createUnauthenticatedClient,
  OpenPaymentsClientError
} = require('@interledger/open-payments');
const { createClient } = require('@supabase/supabase-js');

const PORT = Number(process.env.PORT || 5001);

// Config Open Payments
const MERCHANT_RECEIVER_WALLET_ADDRESS_URL =
  process.env.MERCHANT_RECEIVER_WALLET_ADDRESS_URL ||
  process.env.MERCHANT_WALLET_ADDRESS_URL ||
  'https://ilp.interledger-test.dev/interpyme';

const KEY_ID = process.env.KEY_ID || 'test-key-id';
const PRIVATE_KEY_ENV = process.env.PRIVATE_KEY || '';

const DEFAULT_ASSET_CODE = process.env.ASSET_CODE || 'MXN';
const DEFAULT_ASSET_SCALE = Number(process.env.ASSET_SCALE || 2);
const FINISH_URL =
  process.env.INTERACT_FINISH_URL || process.env.FINISH_URL || 'http://localhost:5174/complete';

// ✅ SUPABASE CONFIG
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

let supabase = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✅ Supabase conectado');
  } catch (error) {
    console.error('❌ Error conectando Supabase:', error.message);
  }
} else {
  console.warn('⚠️ Variables VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY no encontradas');
  console.warn('⚠️ El inventario NO se actualizará');
}

const app = express();
app.use(express.json());

const allowedOrigins = (process.env.CORS_ORIGINS ||
  'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Origen no permitido por CORS: ' + origin));
    },
    credentials: true
  })
);

app.use((req, _res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.path} from ${req.headers.origin || '-'}`
  );
  next();
});

// Helpers
function loadPrivateKeyFromEnv() {
  let pem = PRIVATE_KEY_ENV;
  if (!pem) throw new Error('PRIVATE_KEY vacío');
  pem = pem.replace(/\\n/g, '\n');
  return pem;
}

function normalizePointer(input) {
  let s = String(input || '').trim();
  if (!s) return s;
  if (s.startsWith('$')) s = `https://${s.slice(1)}`;
  try {
    const url = new URL(s);
    if (url.protocol === 'http:') {
      url.protocol = 'https:';
      s = url.toString();
    }
  } catch {}
  return s.replace(/\/+$/, '');
}

function sendOpenPaymentsError(res, err, where = '') {
  if (err instanceof OpenPaymentsClientError) {
    console.error('[OpenPaymentsError]', {
      where,
      message: err.message,
      description: err.description,
      status: err.status,
      code: err.code
    });
    return res.status(err.status || 500).json({
      error: err.message || 'Open Payments error',
      details: err.description || err.details || null
    });
  }
  console.error('[Error]', where, err);
  return res.status(500).json({ error: err.message || 'Internal Server Error' });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn, { retries = 2, delayMs = 400 } = {}) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); } catch (e) { last = e; if (i < retries) await sleep(delayMs * (i + 1)); }
  }
  throw last;
}

// Montos
function toScaledIntegerFromDecimalString(amountStr, assetScale) {
  const [intPart, fracRaw = ''] = String(amountStr).trim().split('.');
  const frac = (fracRaw + '0'.repeat(assetScale)).slice(0, assetScale);
  const digits = (intPart.replace(/^0+/, '') || '0') + frac;
  if (!/^\d+$/.test(digits)) throw new Error('Monto inválido');
  return digits;
}
function addScaled(a, b) { return (BigInt(a || '0') + BigInt(b || '0')).toString(); }
function mulToScaled(unitPrice, qty, assetScale) {
  const p = toScaledIntegerFromDecimalString(String(unitPrice), assetScale);
  return (BigInt(p) * BigInt(qty)).toString();
}
function percentToScaled(amountScaled, percent) {
  const [pi, pf = ''] = String(percent).split('.');
  const pfLen = pf.length;
  const num = BigInt(amountScaled) * BigInt(pi + pf);
  const den = BigInt('1' + '0'.repeat(pfLen));
  return (num / den).toString();
}

// STORAGE
const ORDERS = new Map();
const CHECKOUTS = new Map();

// Clientes OP
let AUTH_CLIENT = null;
async function getAuthClient() {
  if (AUTH_CLIENT) return AUTH_CLIENT;
  const pem = loadPrivateKeyFromEnv();
  console.log('[auth] Inicializando cliente autenticado…');
  AUTH_CLIENT = await createAuthenticatedClient({
    walletAddressUrl: MERCHANT_RECEIVER_WALLET_ADDRESS_URL,
    keyId: KEY_ID,
    privateKey: pem,
    logLevel: 'silent',
    validateResponses: true
  });
  console.log('[auth] OK. client=', MERCHANT_RECEIVER_WALLET_ADDRESS_URL);
  return AUTH_CLIENT;
}

let UNA_CLIENT = null;
async function getUnauthClient() {
  if (UNA_CLIENT) return UNA_CLIENT;
  UNA_CLIENT = await createUnauthenticatedClient({ logLevel: 'silent', validateResponses: true });
  return UNA_CLIENT;
}

// ✅ FUNCIÓN PARA ACTUALIZAR INVENTARIO (MEJORADA)
async function actualizarInventario(items) {
  if (!supabase) {
    console.warn('⚠️ Supabase no configurado, no se puede actualizar inventario');
    return { success: false, error: 'Supabase no configurado' };
  }

  if (!items || items.length === 0) {
    console.warn('⚠️ No hay items para actualizar');
    return { success: false, error: 'Sin items' };
  }

  console.log('\n🔄 ========== INICIO ACTUALIZACIÓN INVENTARIO ==========');
  console.log(`📦 Total de productos a procesar: ${items.length}`);

  const resultados = [];

  for (const item of items) {
    try {
      const productoId = item.id;
      const cantidadVendida = item.qty;
      const nombreProducto = item.name;

      console.log(`\n--- Procesando: ${nombreProducto} ---`);
      console.log(`ID: ${productoId}, Cantidad vendida: ${cantidadVendida}`);

      // Validaciones
      if (!productoId) {
        console.warn(`⚠️ Item sin ID, saltando: ${nombreProducto}`);
        resultados.push({ producto: nombreProducto, success: false, error: 'Sin ID' });
        continue;
      }

      if (!cantidadVendida || cantidadVendida <= 0) {
        console.warn(`⚠️ Cantidad inválida (${cantidadVendida}), saltando: ${nombreProducto}`);
        resultados.push({ producto: nombreProducto, success: false, error: 'Cantidad inválida' });
        continue;
      }

      // 1. Obtener stock actual
      console.log(`🔍 Consultando stock actual en BD...`);
      const { data: productoActual, error: errorConsulta } = await supabase
        .from('productos')
        .select('id, nombre, cantidad')
        .eq('id', productoId)
        .single();

      if (errorConsulta) {
        console.error(`❌ Error consultando producto ${productoId}:`, errorConsulta.message);
        resultados.push({ producto: nombreProducto, success: false, error: errorConsulta.message });
        continue;
      }

      if (!productoActual) {
        console.error(`❌ Producto ${productoId} no existe en BD`);
        resultados.push({ producto: nombreProducto, success: false, error: 'No encontrado' });
        continue;
      }

      const stockActual = productoActual.cantidad;
      console.log(`📊 Stock actual: ${stockActual} unidades`);

      // 2. Validar stock suficiente
      if (stockActual < cantidadVendida) {
        console.error(`❌ Stock insuficiente. Disponible: ${stockActual}, Requerido: ${cantidadVendida}`);
        resultados.push({ 
          producto: nombreProducto, 
          success: false, 
          error: `Stock insuficiente (${stockActual} disponibles)` 
        });
        continue;
      }

      // 3. Calcular nuevo stock
      const nuevoStock = stockActual - cantidadVendida;
      console.log(`🔢 Nuevo stock calculado: ${nuevoStock} unidades`);

      // 4. Actualizar en BD
      console.log(`💾 Actualizando en base de datos...`);
      const { data: productoActualizado, error: errorActualizacion } = await supabase
        .from('productos')
        .update({ 
          cantidad: nuevoStock,
          fecha_actualizacion: new Date().toISOString()
        })
        .eq('id', productoId)
        .select()
        .single();

      if (errorActualizacion) {
        console.error(`❌ Error actualizando:`, errorActualizacion.message);
        resultados.push({ producto: nombreProducto, success: false, error: errorActualizacion.message });
        continue;
      }

      // 5. Verificar actualización
      console.log(`✅ ÉXITO: ${nombreProducto}`);
      console.log(`   Stock anterior: ${stockActual}`);
      console.log(`   Vendidos: ${cantidadVendida}`);
      console.log(`   Stock nuevo: ${productoActualizado.cantidad}`);
      
      resultados.push({ 
        producto: nombreProducto, 
        success: true, 
        stockAnterior: stockActual,
        stockNuevo: productoActualizado.cantidad,
        vendidos: cantidadVendida
      });

    } catch (error) {
      console.error(`❌ Error inesperado procesando ${item.name}:`, error.message);
      resultados.push({ producto: item.name, success: false, error: error.message });
    }
  }

  console.log('\n📊 ========== RESUMEN ACTUALIZACIÓN ==========');
  const exitosos = resultados.filter(r => r.success).length;
  const fallidos = resultados.filter(r => !r.success).length;
  console.log(`✅ Exitosos: ${exitosos}`);
  console.log(`❌ Fallidos: ${fallidos}`);
  console.log('================================================\n');

  return { 
    success: exitosos > 0, 
    resultados,
    exitosos,
    fallidos
  };
}

// RUTAS
app.get('/health', (_req, res) => res.send('ok'));

app.get('/config', async (_req, res) => {
  try {
    const c = await getAuthClient();
    const w = await c.walletAddress.get({ url: MERCHANT_RECEIVER_WALLET_ADDRESS_URL });
    res.json({
      merchantWalletAddressUrl: w.id,
      assetCode: w.assetCode || DEFAULT_ASSET_CODE,
      assetScale: Number(w.assetScale ?? DEFAULT_ASSET_SCALE),
      supabaseConfigured: !!supabase
    });
  } catch (err) {
    return sendOpenPaymentsError(res, err, '/config');
  }
});

// Crear orden
app.post('/pos/create-order', async (req, res) => {
  try {
    const { items = [], taxRate = 0, finishUrl = FINISH_URL } = req.body || {};
    
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Carrito vacío' });
    }

    console.log(`\n🛒 Creando orden con ${items.length} productos`);
    items.forEach(item => {
      console.log(`   - ${item.name} x${item.qty} (ID: ${item.id})`);
    });

    const c = await getAuthClient();
    const wallet = await c.walletAddress.get({ url: MERCHANT_RECEIVER_WALLET_ADDRESS_URL });

    const assetCode = wallet.assetCode || DEFAULT_ASSET_CODE;
    const assetScale = Number(wallet.assetScale ?? DEFAULT_ASSET_SCALE);

    let subtotalScaled = '0';
    for (const it of items) {
      const line = mulToScaled(it.unitPrice, it.qty, assetScale);
      subtotalScaled = addScaled(subtotalScaled, line);
    }
    const ivaScaled = taxRate ? percentToScaled(subtotalScaled, taxRate) : '0';
    const totalScaled = addScaled(subtotalScaled, ivaScaled);
    
    if (BigInt(totalScaled) <= 0n) {
      return res.status(400).json({ error: 'Total inválido' });
    }

    const grant = await c.grant.request(
      { url: wallet.authServer },
      {
        access_token: { access: [{ type: 'incoming-payment', actions: ['create', 'read', 'complete'] }] },
        interact: {
          start: ['redirect'],
          finish: { method: 'redirect', uri: finishUrl, nonce: uuidv4() }
        }
      }
    );

    if (grant.interact?.redirect) {
      return res.status(403).json({
        error: 'Se requiere aprobación del comercio',
        interactRedirect: grant.interact.redirect
      });
    }

    const accessToken = grant.access_token.value;

    const incoming = await c.incomingPayment.create(
      { url: wallet.resourceServer, accessToken },
      {
        walletAddress: wallet.id,
        incomingAmount: { value: totalScaled, assetCode, assetScale },
        metadata: { description: 'POS Open Payments', items, subtotalScaled, ivaScaled, totalScaled }
      }
    );

    const orderId = uuidv4();
    ORDERS.set(orderId, {
      paymentUrl: incoming.id,
      incomingId: incoming.id,
      total: totalScaled,
      assetCode,
      assetScale,
      items,
      inventoryUpdated: false,
      createdAt: new Date().toISOString()
    });

    console.log(`✅ Orden creada: ${orderId}`);
    res.json({ orderId, paymentUrl: incoming.id });
  } catch (err) {
    return sendOpenPaymentsError(res, err, '/pos/create-order');
  }
});

// ✅ ENDPOINT CLAVE: Consultar estado Y actualizar inventario
app.get('/pos/order-status', async (req, res) => {
  try {
    const { orderId } = req.query || {};
    
    if (!orderId || !ORDERS.has(orderId)) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }
    
    const orderData = ORDERS.get(orderId);
    const { paymentUrl, items: orderItems } = orderData;

    // Consultar estado del pago
    const una = await getUnauthClient();
    const ip = await una.incomingPayment.get({ url: paymentUrl });

    const isCompleted = !!ip.completed || ip.state === 'completed';
    
    // ✅ SI EL PAGO SE COMPLETÓ Y AÚN NO SE ACTUALIZÓ EL INVENTARIO
    if (isCompleted && orderItems && orderItems.length > 0 && !orderData.inventoryUpdated) {
      console.log(`\n💰 PAGO COMPLETADO - Orden ${orderId}`);
      console.log(`🔄 Iniciando actualización de inventario...`);
      
      const resultado = await actualizarInventario(orderItems);
      
      if (resultado.success) {
        orderData.inventoryUpdated = true;
        orderData.inventoryUpdatedAt = new Date().toISOString();
        orderData.inventoryResult = resultado;
        ORDERS.set(orderId, orderData);
        
        console.log(`✅ Inventario actualizado correctamente para orden ${orderId}`);
      } else {
        console.error(`❌ Error actualizando inventario:`, resultado.error);
        orderData.inventoryError = resultado.error;
        ORDERS.set(orderId, orderData);
      }
    }

    const status = {
      id: ip.id,
      state: ip.state || (ip.completed ? 'completed' : 'pending'),
      completed: isCompleted,
      walletAddress: ip.walletAddress,
      receivedAmount: ip.receivedAmount || { value: '0', assetCode: DEFAULT_ASSET_CODE, assetScale: DEFAULT_ASSET_SCALE },
      incomingAmount: ip.incomingAmount || null,
      expiresAt: ip.expiresAt || null,
      metadata: ip.metadata || null,
      inventoryUpdated: orderData.inventoryUpdated || false,
      inventoryUpdatedAt: orderData.inventoryUpdatedAt || null,
      inventoryError: orderData.inventoryError || null
    };

    res.json({ status });
  } catch (err) {
    return sendOpenPaymentsError(res, err, '/pos/order-status');
  }
});

// Checkout
app.post('/checkout/start', async (req, res) => {
  try {
    const { customerWalletAddressUrl, receiverPaymentUrl, finishUrl = FINISH_URL } = req.body || {};
    
    if (!customerWalletAddressUrl || !receiverPaymentUrl) {
      return res.status(400).json({ error: 'Faltan parámetros' });
    }

    const pointer = normalizePointer(customerWalletAddressUrl);
    if (!/^https:\/\//i.test(pointer)) {
      return res.status(400).json({ error: 'Payment Pointer inválido' });
    }

    const una = await getUnauthClient();
    const customerWallet = await retry(
      () => una.walletAddress.get({ url: pointer }),
      { retries: 2, delayMs: 500 }
    );

    const c = await getAuthClient();

    const quoteGrant = await c.grant.request(
      { url: customerWallet.authServer },
      { access_token: { access: [{ type: 'quote', actions: ['create', 'read'] }] } }
    );

    const quote = await c.quote.create(
      { url: customerWallet.resourceServer, accessToken: quoteGrant.access_token.value },
      { walletAddress: customerWallet.id, receiver: receiverPaymentUrl, method: 'ilp' }
    );

    const checkoutId = uuidv4();
    const opGrant = await c.grant.request(
      { url: customerWallet.authServer },
      {
        access_token: {
          access: [
            {
              type: 'outgoing-payment',
              actions: ['read', 'create', 'list'],
              identifier: customerWallet.id,
              limits: { debitAmount: quote.debitAmount }
            }
          ]
        },
        interact: {
          start: ['redirect'],
          finish: { method: 'redirect', uri: `${finishUrl}?checkoutId=${encodeURIComponent(checkoutId)}`, nonce: uuidv4() }
        }
      }
    );

    CHECKOUTS.set(checkoutId, {
      continue: opGrant.continue,
      quoteId: quote.id,
      walletId: customerWallet.id,
      resourceServer: customerWallet.resourceServer
    });

    if (opGrant.interact?.redirect) {
      return res.json({ checkoutId, interactRedirect: opGrant.interact.redirect });
    }
    return res.status(500).json({ error: 'No se recibió redirect' });
  } catch (err) {
    return sendOpenPaymentsError(res, err, '/checkout/start');
  }
});

app.post('/checkout/finish', async (req, res) => {
  try {
    const { checkoutId, interactRef } = req.body || {};
    if (!checkoutId || !interactRef) {
      return res.status(400).json({ error: 'Faltan parámetros' });
    }

    const data = CHECKOUTS.get(checkoutId);
    if (!data) return res.status(404).json({ error: 'Checkout no encontrado' });
    if (data.finalized) return res.json({ ok: true, outgoingPaymentId: data.finalized });

    const c = await getAuthClient();

    const finalized = await c.grant.continue(
      { url: data.continue.uri, accessToken: data.continue.access_token?.value },
      { interact_ref: interactRef }
    );

    const op = await c.outgoingPayment.create(
      { url: data.resourceServer, accessToken: finalized.access_token.value },
      { walletAddress: data.walletId, quoteId: data.quoteId, metadata: { description: 'POS Open Payments' } }
    );

    data.finalized = op.id;
    CHECKOUTS.set(checkoutId, data);
    return res.json({ ok: true, outgoingPaymentId: op.id });
  } catch (err) {
    return sendOpenPaymentsError(res, err, '/checkout/finish');
  }
});

app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

app.listen(PORT, () => {
  console.log(`\n🚀 ===================================`);
  console.log(`   Servidor POS Open Payments`);
  console.log(`   Puerto: ${PORT}`);
  console.log(`   Supabase: ${supabase ? '✅ CONECTADO' : '❌ NO CONFIGURADO'}`);
  console.log(`===================================\n`);
});