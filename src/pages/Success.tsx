import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";


function useQuery() {
  return useMemo(() => new URLSearchParams(window.location.search), []);
}

const Success: React.FC = () => {
  const qs = useQuery();
  const navigate = useNavigate();
  const [msg, setMsg] = useState("Finalizando…");

  useEffect(() => {
    (async () => {
      try {
        const paid = qs.get("paid");
        if (paid === "1") {
          setMsg("Pago autorizado ✅. Redirigiendo…");
          setTimeout(() => navigate("/?paid=1"), 800);
          return;
        }

        // Fallback si alguien entra directo a /success sin paid
        setMsg("Pago completado. Redirigiendo…");
        setTimeout(() => navigate("/"), 800);
      } catch (e) {
        console.error(e);
        setMsg("Error inesperado finalizando el pago.");
        setTimeout(() => navigate("/"), 1500);
      }
    })();
  }, [qs, navigate]);

  return (
    <div style={{ padding: 24 }}>
      <h2>Éxito</h2>
      <p>{msg}</p>
    </div>
  );
};

export default Success;
