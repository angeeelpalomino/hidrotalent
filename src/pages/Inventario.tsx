import React, { useEffect, useState, useRef, useCallback } from "react";
import { 
  Plus, 
  Minus, 
  Trash2, 
  Mic, 
  MicOff, 
  X, 
  Image as ImageIcon,
  Upload,
  CheckCircle,
  AlertCircle,
  Play,
  StopCircle,
  Edit,
  Save
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { toast } from "sonner";

type Producto = {
  id: number;
  nombre: string;
  cantidad: number;
  precio_compra: number;
  precio_venta: number;
  imagen_url?: string | null;
  fecha_creacion: string;
  fecha_actualizacion: string;
};

type VoiceStep = 'waiting' | 'product_name' | 'quantity' | 'purchase_price' | 'sale_price' | 'confirm' | 'saving';

type VoiceFlow = {
  step: VoiceStep;
  data: {
    nombre?: string;
    cantidad?: number;
    precio_compra?: number;
    precio_venta?: number;
  };
  transcript: string;
  isActive: boolean;
};

const Inventario: React.FC = () => {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [voiceFlow, setVoiceFlow] = useState<VoiceFlow>({
    step: 'waiting',
    data: {},
    transcript: '',
    isActive: false
  });
  const [showManualModal, setShowManualModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Producto | null>(null);
  const [manualProduct, setManualProduct] = useState({
    nombre: "",
    cantidad: 1,
    precio_compra: 0,
    precio_venta: 0,
    imagen: null as File | null,
  });
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const recognitionRef = useRef<any>(null);
  const isProcessingRef = useRef(false);
  const sessionActiveRef = useRef(false);
  const lastTranscriptRef = useRef("");
  const listeningTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Inicializar reconocimiento de voz
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error('Tu navegador no soporta reconocimiento de voz. Usa Chrome.');
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'es-MX';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log('🎤 Reconocimiento INICIADO');
      setIsListening(true);
      
      if (listeningTimeoutRef.current) {
        clearTimeout(listeningTimeoutRef.current);
      }
      listeningTimeoutRef.current = setTimeout(() => {
        if (sessionActiveRef.current && isListening) {
          console.log('⏱️ Timeout - reiniciando...');
          restartRecognition();
        }
      }, 10000);
    };

    recognition.onresult = (event: any) => {
      if (listeningTimeoutRef.current) {
        clearTimeout(listeningTimeoutRef.current);
      }

      const transcript = event.results[event.resultIndex][0].transcript.trim();
      if (event.results[event.resultIndex].isFinal && transcript !== lastTranscriptRef.current) {
        console.log('🔊 Nuevo texto final:', transcript);
        lastTranscriptRef.current = transcript;
        
        if (!isProcessingRef.current && sessionActiveRef.current) {
          isProcessingRef.current = true;
          setVoiceFlow(prev => ({ ...prev, transcript }));
          processVoiceCommand(transcript.toLowerCase()).finally(() => {
            isProcessingRef.current = false;
          });
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.error('❌ Error reconocimiento:', event.error);
      
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        toast.error('⚠️ Permite el acceso al micrófono en tu navegador');
        stopVoiceSession();
      } else if (event.error === 'no-speech') {
        console.log('🔇 Sin voz detectada');
        if (sessionActiveRef.current) {
          setTimeout(() => restartRecognition(), 500);
        }
      } else if (event.error === 'network') {
        toast.warning('❌ Error de red. Verifica tu conexión.');
        if (sessionActiveRef.current) {
          setTimeout(() => restartRecognition(), 2000);
        }
      } else if (event.error === 'aborted') {
        console.log('⏹️ Reconocimiento abortado');
        if (sessionActiveRef.current) {
          setTimeout(() => restartRecognition(), 500);
        }
      }
    };

    recognition.onend = () => {
      console.log('🔚 Reconocimiento terminó');
      setIsListening(false);
      
      if (sessionActiveRef.current && !isProcessingRef.current) {
        console.log('🔄 Auto-reiniciando reconocimiento...');
        setTimeout(() => restartRecognition(), 300);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (listeningTimeoutRef.current) {
        clearTimeout(listeningTimeoutRef.current);
      }
    };
  }, []);

  const restartRecognition = useCallback(() => {
    if (!sessionActiveRef.current || !recognitionRef.current) return;
    
    try {
      recognitionRef.current.stop();
    } catch (e) {
      console.log('Error stopping:', e);
    }
    
    setTimeout(() => {
      if (sessionActiveRef.current) {
        try {
          recognitionRef.current.start();
          console.log('▶️ Reconocimiento reiniciado');
        } catch (error: any) {
          if (error.message && !error.message.includes('already started')) {
            console.error('Error reiniciando:', error);
            setTimeout(() => restartRecognition(), 1000);
          }
        }
      }
    }, 100);
  }, []);

  const startRecognition = useCallback(() => {
    if (!recognitionRef.current || !sessionActiveRef.current) return;
    
    try {
      recognitionRef.current.start();
      console.log('▶️ Reconocimiento iniciado');
    } catch (error: any) {
      if (error.message && error.message.includes('already started')) {
        console.log('Ya está iniciado');
      } else {
        console.error('Error iniciando:', error);
        setTimeout(() => startRecognition(), 1000);
      }
    }
  }, []);

  const stopRecognition = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.log('Error stopping:', e);
      }
    }
    setIsListening(false);
    if (listeningTimeoutRef.current) {
      clearTimeout(listeningTimeoutRef.current);
    }
  };

  // Cargar productos al iniciar
  useEffect(() => {
    fetchProductos();
  }, []);

  const fetchProductos = async () => {
    try {
      const { data, error } = await supabase
        .from("productos")
        .select("*")
        .order("nombre", { ascending: true });
      
      if (error) throw error;
      setProductos(data || []);
    } catch (error) {
      toast.error("Error cargando productos");
      console.error(error);
    } finally {
      setLoadingProducts(false);
    }
  };

  // Text-to-Speech
  const speakAsync = async (text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        console.log('🗣️ TTS no disponible:', text);
        resolve();
        return;
      }

      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-MX';
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.volume = 1;
      
      utterance.onend = () => {
        console.log('✅ Habla completada');
        resolve();
      };
      
      utterance.onerror = (e) => {
        console.error('Error TTS:', e);
        resolve();
      };
      
      window.speechSynthesis.speak(utterance);
      console.log('🗣️ Hablando:', text);
    });
  };

  // Procesamiento de comandos de voz
  const processVoiceCommand = async (text: string) => {
    const currentStep = voiceFlow.step;
    console.log(`🎯 Procesando [${currentStep}]: "${text}"`);
    
    stopRecognition();
    
    try {
      switch (currentStep) {
        case 'waiting':
          if (text.includes('agregar producto') || text.includes('nuevo producto')) {
            setVoiceFlow(prev => ({ 
              ...prev, 
              step: 'product_name', 
              data: {},
              transcript: ''
            }));
            lastTranscriptRef.current = '';
            await speakAsync('¿Cuál es el nombre del producto?');
          } else {
            await speakAsync('Di "agregar producto" para comenzar');
          }
          break;

        case 'product_name':
          const cleanName = text
            .replace(/^(el|la|un|una|los|las)\s+/i, '')
            .trim(); // Removed the second replace to make it less aggressive
          
          console.log('🔍 Nombre limpio:', cleanName);
          
          if (cleanName.length > 0) {
            const capitalized = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
            console.log('✅ Nombre aceptado:', capitalized);
            setVoiceFlow(prev => ({
              ...prev,
              data: { ...prev.data, nombre: capitalized },
              step: 'quantity',
              transcript: ''
            }));
            lastTranscriptRef.current = '';
            await speakAsync(`${capitalized}. ¿Qué cantidad es?`);
          } else {
            console.log('❌ Nombre inválido');
            await speakAsync('No escuché un nombre válido. Repite el nombre del producto');
          }
          break;

        case 'quantity':
          const numberMatch = text.match(/\d+/);
          const qty = numberMatch ? parseInt(numberMatch[0]) : NaN;
          
          console.log('🔢 Cantidad detectada:', qty);
          
          if (!isNaN(qty) && qty > 0 && qty < 100000) {
            setVoiceFlow(prev => ({
              ...prev,
              data: { ...prev.data, cantidad: qty },
              step: 'purchase_price',
              transcript: ''
            }));
            lastTranscriptRef.current = '';
            await speakAsync(`Cantidad ${qty}. Precio de compra`);
          } else {
            await speakAsync('Di solo el número de unidades, por ejemplo: 50');
          }
          break;

        case 'purchase_price':
          const priceCompraMatch = text.match(/\d+\.?\d*/);
          const priceCompra = priceCompraMatch ? parseFloat(priceCompraMatch[0]) : NaN;
          
          console.log('💰 Precio compra detectado:', priceCompra);
          
          if (!isNaN(priceCompra) && priceCompra > 0) {
            setVoiceFlow(prev => ({
              ...prev,
              data: { ...prev.data, precio_compra: priceCompra },
              step: 'sale_price',
              transcript: ''
            }));
            lastTranscriptRef.current = '';
            await speakAsync(`Precio de compra ${priceCompra}. Precio de venta`);
          } else {
            await speakAsync('Di el precio de compra en pesos, por ejemplo: 10');
          }
          break;

        case 'sale_price':
          const priceVentaMatch = text.match(/\d+\.?\d*/);
          const priceVenta = priceVentaMatch ? parseFloat(priceVentaMatch[0]) : NaN;
          
          console.log('💵 Precio venta detectado:', priceVenta);
          
          if (!isNaN(priceVenta) && priceVenta > 0) {
            const margen = ((priceVenta - (voiceFlow.data.precio_compra || 0)) / priceVenta * 100).toFixed(0);
            setVoiceFlow(prev => ({
              ...prev,
              data: { ...prev.data, precio_venta: priceVenta },
              step: 'confirm',
              transcript: ''
            }));
            lastTranscriptRef.current = '';
            await speakAsync(`Precio de venta ${priceVenta}. Tu margen de ganancia será de ${margen}%, confirma sí para guardar o no para cancelar`);
          } else {
            await speakAsync('Di el precio de venta en pesos, por ejemplo: 20');
          }
          break;

        case 'confirm':
          console.log('❓ Confirmación:', text);
          if (text.includes('sí') || text.includes('si') || text.includes('confirmar') || text.includes('yes') || text.includes('ok')) {
            await saveVoiceProduct();
            return;
          } else if (text.includes('no') || text.includes('cancelar')) {
            await speakAsync('Registro cancelado. Di "agregar producto" para empezar de nuevo');
            setVoiceFlow(prev => ({ ...prev, step: 'waiting', data: {}, transcript: '' }));
            lastTranscriptRef.current = '';
          } else {
            await speakAsync('Di sí para confirmar o no para cancelar');
          }
          break;
      }
    } catch (error) {
      console.error('Error procesando comando:', error);
      toast.error('Error procesando comando de voz');
    } finally {
      if (sessionActiveRef.current) {
        setTimeout(() => startRecognition(), 1000); // Increased delay to 1000ms
      }
    }
  };

  const startVoiceSession = async () => {
    sessionActiveRef.current = true;
    lastTranscriptRef.current = "";
    setVoiceFlow({ step: 'waiting', data: {}, transcript: '', isActive: true });
    
    toast.success('🎤 Asistente de voz activado');
    await speakAsync('Di "agregar producto" para comenzar');
    
    setTimeout(() => {
      lastTranscriptRef.current = '';
      startRecognition();
    }, 1000);
  };

  const stopVoiceSession = () => {
    sessionActiveRef.current = false;
    stopRecognition();
    window.speechSynthesis.cancel();
    setVoiceFlow({ step: 'waiting', data: {}, transcript: '', isActive: false });
    toast.info('⏹️ Asistente de voz desactivado');
  };

  const saveVoiceProduct = async () => {
    const { data } = voiceFlow;
    
    if (!data.nombre || !data.cantidad || !data.precio_compra || !data.precio_venta) {
      toast.error('Datos incompletos');
      await speakAsync('Error: datos incompletos. Di "agregar producto" para empezar de nuevo');
      setVoiceFlow(prev => ({ ...prev, step: 'waiting', data: {}, transcript: '' }));
      lastTranscriptRef.current = '';
      setTimeout(() => startRecognition(), 1000);
      return;
    }

    setVoiceFlow(prev => ({ ...prev, step: 'saving' }));

    try {
      const { error } = await supabase
        .from("productos")
        .insert([{
          nombre: data.nombre,
          cantidad: data.cantidad,
          precio_compra: data.precio_compra,
          precio_venta: data.precio_venta,
          imagen_url: null
        }]);

      if (error) throw error;

      await fetchProductos();
      await speakAsync(`¡Producto ${data.nombre} guardado exitosamente! Di "agregar producto" para añadir otro`);
      toast.success('✅ Producto guardado');
      
      setVoiceFlow(prev => ({ ...prev, step: 'waiting', data: {}, transcript: '' }));
      lastTranscriptRef.current = '';
      setTimeout(() => startRecognition(), 1000);
    } catch (error) {
      toast.error('Error guardando producto');
      console.error(error);
      await speakAsync('Error al guardar el producto. Di "agregar producto" para intentar de nuevo');
      setVoiceFlow(prev => ({ ...prev, step: 'waiting', data: {}, transcript: '' }));
      lastTranscriptRef.current = '';
      setTimeout(() => startRecognition(), 1000);
    }
  };

  const toggleVoice = async () => {
    if (voiceFlow.isActive) {
      stopVoiceSession();
    } else {
      startVoiceSession();
    }
  };

  // Manejo de imágenes
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setManualProduct(prev => ({ ...prev, imagen: file }));
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
      const filePath = `productos/${fileName}`;

      const { error: uploadError, data } = await supabase.storage
        .from('imagenes')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('imagenes')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('Error subiendo imagen:', error);
      toast.error('Error subiendo imagen');
      return null;
    }
  };

  // Guardar producto manual
  const handleSaveManual = async () => {
    if (!manualProduct.nombre || manualProduct.precio_compra <= 0 || manualProduct.precio_venta <= 0) {
      toast.error('Completa todos los campos requeridos');
      return;
    }

    setUploading(true);
    try {
      let imagenUrl = null;
      if (manualProduct.imagen) {
        imagenUrl = await uploadImage(manualProduct.imagen);
      }

      const productoData = {
        nombre: manualProduct.nombre,
        cantidad: manualProduct.cantidad,
        precio_compra: manualProduct.precio_compra,
        precio_venta: manualProduct.precio_venta,
        imagen_url: imagenUrl
      };

      if (editingProduct) {
        const { error } = await supabase
          .from("productos")
          .update(productoData)
          .eq("id", editingProduct.id);
        
        if (error) throw error;
        toast.success('Producto actualizado');
      } else {
        const { error } = await supabase
          .from("productos")
          .insert([productoData]);
        
        if (error) throw error;
        toast.success('Producto agregado');
      }

      await fetchProductos();
      setShowManualModal(false);
      setEditingProduct(null);
      setManualProduct({ nombre: "", cantidad: 1, precio_compra: 0, precio_venta: 0, imagen: null });
      setImagePreview(null);
    } catch (error) {
      toast.error('Error guardando producto');
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  // Editar producto
  const handleEdit = (producto: Producto) => {
    setEditingProduct(producto);
    setManualProduct({
      nombre: producto.nombre,
      cantidad: producto.cantidad,
      precio_compra: producto.precio_compra,
      precio_venta: producto.precio_venta,
      imagen: null
    });
    setImagePreview(producto.imagen_url || null);
    setShowManualModal(true);
  };

  // Eliminar producto
  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar este producto?')) return;

    try {
      const { error } = await supabase
        .from("productos")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
      await fetchProductos();
      toast.success('Producto eliminado');
    } catch (error) {
      toast.error('Error eliminando producto');
      console.error(error);
    }
  };

  // Ajustar cantidad
  const adjustQuantity = async (id: number, delta: number) => {
    const producto = productos.find(p => p.id === id);
    if (!producto) return;

    const newQuantity = Math.max(0, producto.cantidad + delta);
    
    try {
      const { error } = await supabase
        .from("productos")
        .update({ cantidad: newQuantity })
        .eq("id", id);
      
      if (error) throw error;
      await fetchProductos();
    } catch (error) {
      toast.error('Error actualizando cantidad');
      console.error(error);
    }
  };

  const getStepStatus = (step: VoiceStep): 'active' | 'done' | 'pending' => {
    if (voiceFlow.step === step) return 'active';
    const steps: VoiceStep[] = ['product_name', 'quantity', 'purchase_price', 'sale_price'];
    const currentIndex = steps.indexOf(voiceFlow.step);
    const stepIndex = steps.indexOf(step);
    return stepIndex < currentIndex ? 'done' : 'pending';
  };

  if (loadingProducts) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">Cargando inventario...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">📦 Inventario</h1>
        
        <div className="flex gap-3">
          <button
            onClick={() => {
              setEditingProduct(null);
              setManualProduct({ nombre: "", cantidad: 1, precio_compra: 0, precio_venta: 0, imagen: null });
              setImagePreview(null);
              setShowManualModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold transition"
          >
            <Plus className="h-5 w-5" />
            Manual
          </button>
          
          <button
            onClick={toggleVoice}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold transition ${
              voiceFlow.isActive
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            {voiceFlow.isActive ? (
              <>
                <StopCircle className="h-5 w-5" />
                Detener Voz
              </>
            ) : (
              <>
                <Mic className="h-5 w-5" />
                Activar Voz
              </>
            )}
          </button>
        </div>
      </div>

      {/* Indicador de escucha */}
      {isListening && (
        <div className="mb-4 p-4 bg-red-50 border-2 border-red-300 rounded-lg flex items-center gap-3 animate-pulse">
          <div className="w-4 h-4 bg-red-500 rounded-full animate-ping"></div>
          <div className="flex-1">
            <p className="font-bold text-red-800">🎤 ESCUCHANDO...</p>
            <p className="text-sm text-red-600">{voiceFlow.transcript || 'Esperando tu voz...'}</p>
          </div>
        </div>
      )}

      {/* Progreso de voz */}
      {voiceFlow.isActive && voiceFlow.step !== 'waiting' && (
        <div className="mb-6 p-5 bg-white rounded-xl shadow-lg border-2 border-blue-200">
          <h3 className="font-bold text-lg mb-4 text-blue-800">Agregando producto...</h3>
          
          <div className="flex justify-around mb-5">
            {[
              { step: 'product_name' as VoiceStep, label: 'Nombre', icon: '📦' },
              { step: 'quantity' as VoiceStep, label: 'Cantidad', icon: '📊' },
              { step: 'purchase_price' as VoiceStep, label: 'Compra', icon: '💰' },
              { step: 'sale_price' as VoiceStep, label: 'Venta', icon: '💵' }
            ].map(({ step, label, icon }) => {
              const status = getStepStatus(step);
              return (
                <div key={step} className="text-center">
                  <div className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center text-2xl transition-all ${
                    status === 'active' ? 'bg-blue-500 text-white scale-110 animate-bounce' :
                    status === 'done' ? 'bg-green-500 text-white' : 'bg-gray-200'
                  }`}>
                    {status === 'active' ? '🎤' : status === 'done' ? '✅' : icon}
                  </div>
                  <div className="text-xs mt-2 font-medium">{label}</div>
                </div>
              );
            })}
          </div>

          {voiceFlow.data.nombre && (
            <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-200">
              <h3 className="font-bold text-lg text-blue-900">{voiceFlow.data.nombre}</h3>
              <div className="grid grid-cols-3 gap-4 mt-2 text-sm">
                {voiceFlow.data.cantidad && (
                  <div>
                    <span className="text-gray-600">Stock:</span>
                    <span className="font-bold ml-2">{voiceFlow.data.cantidad}</span>
                  </div>
                )}
                {voiceFlow.data.precio_compra && (
                  <div>
                    <span className="text-gray-600">Compra:</span>
                    <span className="font-bold ml-2">${voiceFlow.data.precio_compra}</span>
                  </div>
                )}
                {voiceFlow.data.precio_venta && (
                  <div>
                    <span className="text-gray-600">Venta:</span>
                    <span className="font-bold ml-2">${voiceFlow.data.precio_venta}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lista de productos */}
      <div className="grid gap-4 mb-6">
        {productos.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <p className="text-gray-500 text-lg">No hay productos en el inventario</p>
            <p className="text-gray-400 text-sm mt-2">Agrega productos usando voz o manualmente</p>
          </div>
        ) : (
          productos.map(producto => (
            <div key={producto.id} className="p-4 bg-white rounded-lg shadow-md hover:shadow-lg transition border border-gray-200">
              <div className="flex items-center gap-4">
                {/* Imagen */}
                {producto.imagen_url ? (
                  <img 
                    src={producto.imagen_url} 
                    alt={producto.nombre}
                    className="w-20 h-20 object-cover rounded-lg border-2 border-gray-200"
                  />
                ) : (
                  <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center border-2 border-gray-200">
                    <ImageIcon className="h-8 w-8 text-gray-400" />
                  </div>
                )}

                {/* Info */}
                <div className="flex-1">
                  <h3 className="font-bold text-lg text-gray-800">{producto.nombre}</h3>
                  <div className="flex gap-4 mt-1 text-sm text-gray-600">
                    <span>Compra: <span className="font-semibold text-green-600">${producto.precio_compra}</span></span>
                    <span>Venta: <span className="font-semibold text-blue-600">${producto.precio_venta}</span></span>
                    <span>Margen: <span className="font-semibold text-purple-600">
                      {((producto.precio_venta - producto.precio_compra) / producto.precio_venta * 100).toFixed(0)}%
                    </span></span>
                  </div>
                </div>

                {/* Cantidad */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => adjustQuantity(producto.id, -1)}
                    className="p-2 bg-red-100 hover:bg-red-200 rounded-lg transition"
                    disabled={producto.cantidad === 0}
                  >
                    <Minus className="h-4 w-4 text-red-600" />
                  </button>
                  <div className="text-center min-w-[60px]">
                    <div className="text-2xl font-bold text-gray-800">{producto.cantidad}</div>
                    <div className="text-xs text-gray-500">unidades</div>
                  </div>
                  <button
                    onClick={() => adjustQuantity(producto.id, 1)}
                    className="p-2 bg-green-100 hover:bg-green-200 rounded-lg transition"
                  >
                    <Plus className="h-4 w-4 text-green-600" />
                  </button>
                </div>

                {/* Acciones */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(producto)}
                    className="p-2 bg-blue-100 hover:bg-blue-200 rounded-lg transition"
                    title="Editar"
                  >
                    <Edit className="h-5 w-5 text-blue-600" />
                  </button>
                  <button
                    onClick={() => handleDelete(producto.id)}
                    className="p-2 bg-red-100 hover:bg-red-200 rounded-lg transition"
                    title="Eliminar"
                  >
                    <Trash2 className="h-5 w-5 text-red-600" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Manual */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-800">
                  {editingProduct ? '✏️ Editar Producto' : '➕ Nuevo Producto'}
                </h2>
                <button
                  onClick={() => {
                    setShowManualModal(false);
                    setEditingProduct(null);
                    setManualProduct({ nombre: "", cantidad: 1, precio_compra: 0, precio_venta: 0, imagen: null });
                    setImagePreview(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Imagen */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Imagen (opcional)
                  </label>
                  <div className="flex items-center gap-4">
                    {imagePreview ? (
                      <div className="relative">
                        <img 
                          src={imagePreview} 
                          alt="Preview" 
                          className="w-24 h-24 object-cover rounded-lg border-2 border-gray-300"
                        />
                        <button
                          onClick={() => {
                            setImagePreview(null);
                            setManualProduct(prev => ({ ...prev, imagen: null }));
                          }}
                          className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
                        <ImageIcon className="h-8 w-8 text-gray-400" />
                      </div>
                    )}
                    <label className="cursor-pointer flex-1">
                      <div className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-center font-semibold transition">
                        <Upload className="h-5 w-5 inline mr-2" />
                        Subir Imagen
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {/* Nombre */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Nombre del producto *
                  </label>
                  <input
                    type="text"
                    value={manualProduct.nombre}
                    onChange={(e) => setManualProduct(prev => ({ ...prev, nombre: e.target.value }))}
                    placeholder="Ej: Coca Cola 600ml"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {/* Cantidad */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Cantidad en stock *
                  </label>
                  <input
                    type="number"
                    value={manualProduct.cantidad}
                    onChange={(e) => setManualProduct(prev => ({ ...prev, cantidad: parseInt(e.target.value) || 0 }))}
                    min="0"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {/* Precios */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Precio Compra *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-gray-500">$</span>
                      <input
                        type="number"
                        value={manualProduct.precio_compra || ''}
                        onChange={(e) => setManualProduct(prev => ({ ...prev, precio_compra: parseFloat(e.target.value) || 0 }))}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        className="w-full pl-8 pr-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Precio Venta *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-gray-500">$</span>
                      <input
                        type="number"
                        value={manualProduct.precio_venta || ''}
                        onChange={(e) => setManualProduct(prev => ({ ...prev, precio_venta: parseFloat(e.target.value) || 0 }))}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        className="w-full pl-8 pr-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Margen calculado */}
                {manualProduct.precio_compra > 0 && manualProduct.precio_venta > 0 && (
                  <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-purple-800">Margen de ganancia:</span>
                      <span className="text-lg font-bold text-purple-600">
                        {((manualProduct.precio_venta - manualProduct.precio_compra) / manualProduct.precio_venta * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-xs text-purple-600">Ganancia por unidad:</span>
                      <span className="text-sm font-bold text-purple-600">
                        ${(manualProduct.precio_venta - manualProduct.precio_compra).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Botones */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => {
                      setShowManualModal(false);
                      setEditingProduct(null);
                      setManualProduct({ nombre: "", cantidad: 1, precio_compra: 0, precio_venta: 0, imagen: null });
                      setImagePreview(null);
                    }}
                    className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-semibold transition"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveManual}
                    disabled={uploading || !manualProduct.nombre || manualProduct.precio_compra <= 0 || manualProduct.precio_venta <= 0}
                    className="flex-1 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {uploading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Guardando...
                      </>
                    ) : (
                      <>
                        <Save className="h-5 w-5" />
                        {editingProduct ? 'Actualizar' : 'Guardar'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Guía de uso */}
      <div className="mt-6 p-5 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border-2 border-blue-200">
        <h3 className="font-bold text-lg mb-3 text-blue-900">🎤 Guía de Uso - Asistente de Voz</h3>
        <div className="space-y-2 text-sm text-gray-700">
          <div className="flex items-start gap-2">
            <span className="font-bold text-blue-600">1.</span>
            <span>Presiona <strong>"Activar Voz"</strong> para iniciar el asistente</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-blue-600">2.</span>
            <span>Di <strong>"agregar producto"</strong></span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-blue-600">3.</span>
            <span>Di el nombre del producto, por ejemplo: "Sabritas"</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-blue-600">4.</span>
            <span>Di la cantidad, por ejemplo: "50"</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-blue-600">5.</span>
            <span>Di el precio de compra, por ejemplo: "10"</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-blue-600">6.</span>
            <span>Di el precio de venta, por ejemplo: "20"</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-blue-600">7.</span>
            <span>Confirma con <strong>"sí"</strong> para guardar o <strong>"no"</strong> para cancelar</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-blue-600">8.</span>
            <span>El micrófono permanece activo hasta que presiones <strong>"Detener Voz"</strong></span>
          </div>
        </div>
        
        <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
          <p className="text-sm font-semibold text-yellow-800">⚠️ Requisitos importantes:</p>
          <ul className="text-xs text-yellow-700 mt-2 space-y-1">
            <li>• Usa <strong>Google Chrome</strong> para mejor compatibilidad</li>
            <li>• Permite el acceso al micrófono cuando te lo solicite</li>
            <li>• Habla claro y espera la respuesta del asistente</li>
            <li>• Funciona mejor en conexiones HTTPS</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Inventario;