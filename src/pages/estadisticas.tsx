import React, { useEffect, useState } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  Package, 
  Calendar, 
  FileText,
  FileSpreadsheet,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { Line, Bar, Scatter as ScatterChart } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabaseClient'; // Ajusta la ruta

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface Venta {
  id: number;
  producto: string;
  categoria: string;
  cantidad: number;
  precio_unitario: number;
  fecha: string;
  total?: number;
}

interface Stats {
  totalVentas: number;
  totalIngresos: number;
  ventasHoy: number;
  ventasMes: number;
  productoMasVendido: string;
  categoriaMasVendida: string;
  promedioDiario: number;
}

const EstadisticasPage: React.FC = () => {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState<'excel' | 'pdf' | null>(null);
  const [refrescando, setRefrescando] = useState(false);

  // Cargar datos desde Supabase
  const fetchVentasDesdeSupabase = async () => {
    try {
      setLoading(true);
      setError(null);
      setRefrescando(true);

      // Consulta a Supabase
      const { data, error } = await supabase
        .from('ventas')
        .select('id, producto, categoria, cantidad, precio_unitario, fecha')
        .order('fecha', { ascending: false });

      if (error) {
        throw new Error(`Error de Supabase: ${error.message}`);
      }

      if (!data || data.length === 0) {
        setError('No se encontraron datos de ventas');
        setVentas([]);
        return;
      }

      // Agregar campo total y formatear fecha
      const ventasConTotal: Venta[] = data.map((v: Venta) => ({
        ...v,
        total: v.cantidad * v.precio_unitario,
        fecha: new Date(v.fecha).toISOString().split('T')[0] // Asegurar formato YYYY-MM-DD
      }));

      setVentas(ventasConTotal);
      calcularEstadisticas(ventasConTotal);

    } catch (err: any) {
      console.error('Error cargando datos:', err);
      setError(`Error al conectar con Supabase: ${err.message}`);
      setVentas([]);
    } finally {
      setLoading(false);
      setRefrescando(false);
    }
  };

  // Calcular estadísticas
  const calcularEstadisticas = (ventasData: Venta[]) => {
    if (ventasData.length === 0) return;

    const totalVentas = ventasData.length;
    const totalIngresos = ventasData.reduce((sum, v) => sum + (v.total || 0), 0);
    
    const ventasPorProducto = ventasData.reduce((acc, v) => {
      acc[v.producto] = (acc[v.producto] || 0) + v.cantidad;
      return acc;
    }, {} as Record<string, number>);

    const ventasPorCategoria = ventasData.reduce((acc, v) => {
      acc[v.categoria] = (acc[v.categoria] || 0) + (v.total || 0);
      return acc;
    }, {} as Record<string, number>);

    const hoy = new Date().toDateString();
    const mesActual = new Date().getMonth();
    const añoActual = new Date().getFullYear();

    setStats({
      totalVentas,
      totalIngresos,
      ventasHoy: ventasData.filter(v => 
        new Date(v.fecha).toDateString() === hoy
      ).length,
      ventasMes: ventasData.filter(v => {
        const fecha = new Date(v.fecha);
        return fecha.getMonth() === mesActual && fecha.getFullYear() === añoActual;
      }).length,
      productoMasVendido: Object.entries(ventasPorProducto)
        .reduce((a, b) => (a[1] > b[1] ? a : b))[0] || 'N/A',
      categoriaMasVendida: Object.entries(ventasPorCategoria)
        .reduce((a, b) => (a[1] > b[1] ? a : b))[0] || 'N/A',
      promedioDiario: totalIngresos / totalVentas || 0
    });
  };

  // Cargar datos al montar el componente
  useEffect(() => {
    fetchVentasDesdeSupabase();
  }, []);

  // Datos para gráficos
  const datosVentasMensuales = ventas.reduce((acc, v) => {
    const mes = new Date(v.fecha).toLocaleDateString('es-ES', { 
      month: 'short', 
      year: 'numeric' 
    });
    acc[mes] = (acc[mes] || 0) + (v.total || 0);
    return acc;
  }, {} as Record<string, number>);

  const labels = Object.keys(datosVentasMensuales).sort();
  const dataVentas = {
    labels,
    datasets: [{
      label: 'Ingresos ($)',
      data: labels.map(label => datosVentasMensuales[label]),
      borderColor: 'rgb(59, 130, 246)',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      tension: 0.4,
      fill: true
    }]
  };

  const categoriasUnicas = [...new Set(ventas.map(v => v.categoria))];
  const dataCategorias = {
    labels: categoriasUnicas,
    datasets: [{
      label: 'Ingresos por Categoría ($)',
      data: categoriasUnicas.map(cat => 
        ventas
          .filter(v => v.categoria === cat)
          .reduce((sum, v) => sum + (v.total || 0), 0)
      ),
      backgroundColor: [
        'rgba(255, 99, 132, 0.6)',
        'rgba(54, 162, 235, 0.6)',
        'rgba(255, 205, 86, 0.6)',
        'rgba(75, 192, 192, 0.6)',
        'rgba(153, 102, 255, 0.6)',
        'rgba(255, 159, 64, 0.6)',
      ],
      borderWidth: 1
    }]
  };

  // Datos para la gráfica de dispersión
  const dataDispersion = {
    datasets: [{
      label: 'Cantidad vs Ingresos',
      data: ventas.map(v => ({
        x: v.cantidad,
        y: v.total || 0
      })),
      backgroundColor: 'rgba(75, 192, 192, 0.6)',
      borderColor: 'rgba(75, 192, 192, 1)',
      pointRadius: 5,
      pointHoverRadius: 8
    }]
  };

  const opcionesDispersion = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const v = ventas[context.dataIndex];
            return `${v.producto}: ${v.cantidad} unidades, $${(v.total || 0).toLocaleString()}`;
          }
        }
      }
    },
    scales: {
      x: {
        title: { display: true, text: 'Cantidad Vendida' },
        beginAtZero: true
      },
      y: {
        title: { display: true, text: 'Ingresos ($)' },
        beginAtZero: true,
        ticks: {
          callback: (value: any) => `$${Number(value).toLocaleString()}`
        }
      }
    }
  };

  const prediccionVentas = () => {
    if (labels.length === 0) return 0;
    if (labels.length < 3) {
      return Math.round(
        dataVentas.datasets[0].data.reduce((a, b) => a + b, 0) / labels.length * 1.05
      );
    }
    const ultimos3 = labels.slice(-3).reduce((sum, label) => {
      return sum + datosVentasMensuales[label];
    }, 0);
    return Math.round(ultimos3 / 3 * 1.05);
  };

  const opcionesChart = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const },
    },
    scales: {
      y: { 
        beginAtZero: true,
        ticks: { 
          callback: (value: any) => `$${Number(value).toLocaleString()}`,
        }
      }
    }
  };

  // Exportar Excel
  const exportarExcel = async () => {
    setExportando('excel');
    try {
      const worksheet = XLSX.utils.json_to_sheet(ventas.map(v => ({
        ID: v.id,
        Producto: v.producto,
        'Categoría': v.categoria,
        Cantidad: v.cantidad,
        'Precio Unitario': `$${v.precio_unitario.toFixed(2)}`,
        Fecha: v.fecha,
        Total: `$${(v.total || 0).toFixed(2)}`
      })));
      
      const colWidths = [
        { wch: 8 }, { wch: 25 }, { wch: 15 }, { wch: 10 }, 
        { wch: 15 }, { wch: 12 }, { wch: 12 }
      ];
      worksheet['!cols'] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventas');
      
      const statsData = [
        ['ESTADÍSTICAS DE VENTAS'],
        ['Total Ventas', stats?.totalVentas?.toLocaleString() || 0],
        ['Total Ingresos', `$${stats?.totalIngresos?.toLocaleString() || 0}`],
        ['Producto Más Vendido', stats?.productoMasVendido || 'N/A'],
        ['Categoría Más Vendida', stats?.categoriaMasVendida || 'N/A'],
        ['Predicción Próximo Mes', `$${prediccionVentas().toLocaleString()}`]
      ];
      const statsSheet = XLSX.utils.aoa_to_sheet(statsData);
      XLSX.utils.book_append_sheet(workbook, statsSheet, 'Estadísticas');

      XLSX.writeFile(
        workbook, 
        `reporte_ventas_${new Date().toISOString().split('T')[0]}.xlsx`
      );
    } catch (error) {
      console.error('Error exportando Excel:', error);
      alert('Error al exportar Excel');
    } finally {
      setExportando(null);
    }
  };

  // Exportar PDF
  const exportarPDF = async () => {
    setExportando('pdf');
    try {
      const doc = new jsPDF('l', 'mm', 'a4');
      
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('REPORTE DE VENTAS - SUPABASE', 14, 20);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, 14, 28);
      doc.text(`Total registros: ${ventas.length}`, 14, 35);

      // Estadísticas
      let startY = 45;
      doc.setFont('helvetica', 'bold');
      doc.text('ESTADÍSTICAS', 14, startY);
      
      startY += 10;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Total Ventas: ${stats?.totalVentas || 0}`, 14, startY);
      doc.text(`Total Ingresos: $${stats?.totalIngresos?.toLocaleString() || 0}`, 14, startY + 5);
      doc.text(`Producto Líder: ${stats?.productoMasVendido || 'N/A'}`, 14, startY + 10);
      doc.text(`Categoría Líder: ${stats?.categoriaMasVendida || 'N/A'}`, 14, startY + 15);

      // Tabla de ventas
      const ventasParaTabla = ventas.slice(0, 20).map(v => [
        v.id, v.producto, v.categoria, v.cantidad,
        `$${v.precio_unitario.toFixed(2)}`, v.fecha, `$${(v.total || 0).toFixed(2)}`
      ]);

      import('jspdf-autotable').then(({ default: autoTable }) => {
        autoTable(doc, {
          startY: startY + 25,
          head: [['ID', 'Producto', 'Categoría', 'Cant.', 'Precio', 'Fecha', 'Total']],
          body: ventasParaTabla,
          theme: 'grid',
          styles: { fontSize: 7 },
          headStyles: { fillColor: [59, 130, 246] },
          margin: { left: 14, right: 14 }
        });
        
        doc.save(`reporte_ventas_${new Date().toISOString().split('T')[0]}.pdf`);
      });
    } catch (error) {
      console.error('Error exportando PDF:', error);
      alert('Error al exportar PDF');
    } finally {
      setExportando(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Conectando con Supabase...</p>
          <p className="text-sm text-gray-500">Cargando datos de ventas</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <BarChart3 className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Estadísticas de Ventas</h1>
            <p className="text-gray-600">Datos en tiempo real</p>
          </div>
        </div>
        
        <button
          onClick={fetchVentasDesdeSupabase}
          disabled={refrescando}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refrescando ? 'animate-spin' : ''}`} />
          {refrescando ? 'Refrescando...' : 'Actualizar'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
          <button 
            onClick={fetchVentasDesdeSupabase}
            className="mt-2 text-red-600 hover:underline text-sm"
          >
            Reintentar conexión
          </button>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Ventas</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalVentas.toLocaleString()}</p>
              </div>
              <Package className="h-8 w-8 text-green-500" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Ingresos</p>
                <p className="text-2xl font-bold text-gray-900">${stats.totalIngresos.toLocaleString()}</p>
              </div>
              <DollarSign className="h-8 w-8 text-blue-500" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Producto Líder</p>
                <p className="text-lg font-semibold text-gray-900">{stats.productoMasVendido}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-500" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Categoría Líder</p>
                <p className="text-lg font-semibold text-gray-900">{stats.categoriaMasVendida}</p>
              </div>
              <BarChart3 className="h-8 w-8 text-indigo-500" />
            </div>
          </div>
        </div>
      )}

      {/* Predicción */}
      {stats && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-xl mb-8 border">
          <div className="flex items-center gap-4 mb-4">
            <Calendar className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-semibold">Predicción Próximo Mes</h2>
          </div>
          <p className="text-3xl font-bold text-blue-600">
            ${prediccionVentas().toLocaleString()}
          </p>
        </div>
      )}

      {/* Gráficos */}
      {ventas.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <h3 className="text-lg font-semibold mb-4">Tendencia Mensual</h3>
            <div className="h-80">
              <Line data={dataVentas} options={opcionesChart} />
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <h3 className="text-lg font-semibold mb-4">Por Categoría</h3>
            <div className="h-80">
              <Bar data={dataCategorias} options={opcionesChart} />
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <h3 className="text-lg font-semibold mb-4">Cantidad vs Ingresos</h3>
            <div className="h-80">
              <ScatterChart data={dataDispersion} options={opcionesDispersion} />
            </div>
          </div>
        </div>
      )}

      {/* Botones Exportar */}
      <div className="flex flex-wrap gap-4 justify-end">
        <button 
          onClick={exportarExcel}
          disabled={exportando === 'excel' || ventas.length === 0}
          className="flex items-center gap-2 bg-green-600 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:cursor-not-allowed"
        >
          {exportando === 'excel' ? (
            <RefreshCw className="animate-spin h-4 w-4" />
          ) : (
            <FileSpreadsheet className="h-4 w-4" />
          )}
          {exportando === 'excel' ? 'Exportando...' : 'Excel'}
        </button>
        
        <button 
          onClick={exportarPDF}
          disabled={exportando === 'pdf' || ventas.length === 0}
          className="flex items-center gap-2 bg-red-600 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg hover:bg-red-700 disabled:cursor-not-allowed"
        >
          {exportando === 'pdf' ? (
            <RefreshCw className="animate-spin h-4 w-4" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          {exportando === 'pdf' ? 'Exportando...' : 'PDF'}
        </button>
      </div>

      {/* Info de datos */}
      {ventas.length > 0 && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
          Cargados {ventas.length} registros
        </div>
      )}
    </div>
  );
};

export default EstadisticasPage;