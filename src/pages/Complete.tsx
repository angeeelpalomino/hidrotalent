import React, { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'https://interpyme00.onrender.com'; // Fallback a Render por seguridad

const Complete: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const interactRef = params.get('interact_ref') || params.get('interactRef');
        if (!interactRef) return navigate('/', { replace: true });

        const stored1 = sessionStorage.getItem('checkoutId') || '';
        const stored2 = localStorage.getItem('checkoutId') || '';
        const checkoutId = params.get('checkoutId') || stored1 || stored2;
        if (!checkoutId) return navigate('/', { replace: true });

        // Limpiar storage
        sessionStorage.removeItem('checkoutId');
        localStorage.removeItem('checkoutId');

        const resp = await fetch(`${API_URL}/checkout/finish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checkoutId, interactRef })
        });
        const data = await resp.json().catch(() => ({} as any));
        if (!resp.ok) throw new Error(data?.error || 'finish failed');

        // Éxito → a Success (o redirige directo a Home con ?paid=1)
        navigate('/success?paid=1', { replace: true });
      } catch {
        navigate('/', { replace: true });
      }
    })();
  }, [params, navigate]);

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: '0 auto' }}>
      <h2>Finalizando pago…</h2>
      <p>Confirmando autorización con la wallet del cliente. Esto tomará unos segundos.</p>
    </div>
  );
};

export default Complete;