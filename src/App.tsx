import React from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Ventas from "./pages/Ventas";
import Transacciones from "./pages/Transacciones";
import EstadisticasPage from "./pages/estadisticas";
import Inventario from "./pages/Inventario";
import Complete from "./pages/Complete";
import Success from "./pages/Success";
import NotFound from "./pages/NotFound";

const App: React.FC = () => {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/ventas" element={<Ventas />} />
        <Route path="/transacciones" element={<Transacciones />} />
        <Route path="/inventario" element={<Inventario />} />
        <Route path="/complete" element={<Complete />} />
        <Route path="/estadisticas" element={<EstadisticasPage />} />
        <Route path="/success" element={<Success />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
};

export default App;
