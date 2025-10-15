import React from 'react';
import { Link } from 'react-router-dom';

const NotFound: React.FC = () => {
  return (
    <div style={{ padding: 24 }}>
      <h2>404 - No encontrado</h2>
      <p>La ruta que buscaste no existe.</p>
      <Link to="/">Volver al inicio</Link>
    </div>
  );
};

export default NotFound;
