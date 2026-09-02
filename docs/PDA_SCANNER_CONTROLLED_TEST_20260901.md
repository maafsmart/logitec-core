# LOGITEC CORE WMS — Laboratorio controlado PDA / Scanner

Fecha: 2026-09-01
Rama: feat/pda-scanner-test-lab-20260901

## Objetivo
Preparar una prueba controlada en piso para validar el barrido con PDAs y teléfonos celulares sin poner en riesgo el inventario real.

## Alcance funcional de LOGITEC a validar
- SKU / producto
- Ubicación
- Lote, cuando aplique
- Serie / IMEI, cuando aplique
- Flujo posterior de entrada, movimiento, picking y salida (solo en fase operativa controlada)

## Principio de seguridad
La primera fase del laboratorio NO debe crear movimientos, reservas, salidas, entradas ni modificar inventario.
Debe limitarse a capturar, interpretar y registrar resultados de lectura/diagnóstico.
La fase operativa se hará después, deliberadamente y con una operación de prueba controlada.

## Interfaz requerida
Crear una pantalla aislada de diagnóstico, usable en escritorio, PDA Android y teléfono celular.

Debe permitir capturar:

### Datos del equipo
- Tipo de dispositivo: PDA / teléfono / lector externo / otro
- Marca
- Modelo
- Sistema operativo / versión, si se conoce
- Cantidad total disponible
- Cantidad prevista trabajando simultáneamente
- Cantidad prevista este mes
- Cantidad prevista hacia fin de 2026
- Tipo de lector: integrado / cámara / Bluetooth / USB / emulación teclado / desconocido

### Datos de la prueba
- Identificador de prueba
- Zona / ubicación física del almacén
- Distancia aproximada de lectura: <1 m / 1–2 m / 2–4 m / >4 m
- Tipo esperado: SKU / ubicación / lote / serie-IMEI / otro
- Código leído
- Forma de captura: scanner como teclado / cámara / pegado manual / otro
- Hora
- Tiempo de lectura / respuesta, cuando sea posible medirlo
- Resultado: OK / no leído / leído incorrectamente / reconocido pero no encontrado / otro
- Observaciones

### Conectividad
No integrar un speed test propio.
El operador hará un speed test externo (Telmex, Ookla u otro) y copiará al laboratorio:
- Proveedor / red
- Zona
- Ping ms
- Descarga Mbps
- Subida Mbps
- Observaciones de estabilidad
- Texto libre para pegar el resultado completo o referencia de la captura

## Experiencia de prueba
1. Campo principal grande y siempre fácil de enfocar para lectores que actúan como teclado.
2. Aceptar lectura terminada por Enter.
3. Mostrar inmediatamente:
   - valor leído
   - clasificación tentativa
   - coincidencia en LOGITEC si puede consultarse de forma segura
   - tiempo de respuesta
   - resultado
4. Botón para repetir prueba.
5. Historial temporal de pruebas de la sesión.
6. Opción de copiar/exportar un resumen simple de los resultados.
7. Si es viable sin introducir dependencias pesadas, habilitar lectura por cámara del teléfono desde navegador. Si no es robusto/compatible, dejarlo fuera y documentar la razón; no usar Google Lens como integración operativa.

## Clasificación
Intentar clasificar un código como SKU, ubicación, lote o serie/IMEI usando servicios/consultas existentes del sistema cuando sea posible.
No inventar entidades.
Si un mismo valor puede corresponder a más de un tipo, mostrar AMBIGUO y las coincidencias.

## Medición recomendada
Registrar como mínimo:
- dispositivo
- zona
- distancia
- tipo de dato
- código
- resultado
- latencia/tiempo
- conectividad asociada

Ejemplo de salida:
PDA-01 | AN20 | <1 m | SKU | 037-579419-002 | OK | 420 ms | ping 18 ms / 92 Mbps down / 24 Mbps up

## Segunda fase: prueba operativa
No implementarla automáticamente si existe riesgo de afectar inventario.
Preparar el laboratorio para que, tras validar lectura, pueda definirse una prueba separada:
SKU -> ubicación -> lote/serie si aplica -> operación -> verificación antes/después.

## Permisos
Preferencia: solo ADMIN o modo técnico autorizado.
No exponerlo como función normal de operación hasta que se valide.

## Restricciones
- No modificar producción.
- No hacer deploy.
- No hacer merge.
- No borrar ni alterar inventario real.
- Reutilizar componentes/servicios existentes.
- Evitar cambios invasivos en Picking, Entradas, Movimientos o Salidas.
- Mantener la implementación aislada y fácil de retirar.
- Agregar pruebas automatizadas para asegurar que la fase diagnóstica no muta inventario.
- Ejecutar tsc, build y pruebas relevantes.

## Entregable de Cursor
Implementar el laboratorio en esta rama y reportar:
1. URL/ruta local o de entorno de prueba.
2. Archivos modificados.
3. Cómo se prueba con una PDA que emula teclado.
4. Si se logró cámara de celular y compatibilidad esperada.
5. Evidencia de que el diagnóstico no modifica inventario.
6. Resultado de tsc/build/tests.
7. Cualquier decisión que requiera a Rodrigo antes de continuar.

No merge, no deploy, no producción.

## Implementación de fase diagnóstica

- Ruta: `/pda-scanner-lab.html`, accesible únicamente con sesión `ADMIN` y un cliente operativo seleccionado.
- El historial vive solo en memoria de la pestaña y puede copiarse o exportarse a CSV; no se crea ningún `ScanEvent` ni otro registro de base de datos.
- El endpoint `GET /api/admin/pda-scanner-diagnostic/classify` realiza consultas exactas; SKU/barcode, lote y serie/IMEI permanecen aislados por cliente.
- Las ubicaciones son maestro global por almacén (no tienen `clientId`): para ADMIN se reconocen por código exacto y estado activo aunque estén vacías, igual que en el listado vigente de ubicaciones. El diagnóstico solo devuelve código y almacén.
- El speed test sigue siendo externo y su resultado se captura manualmente.
- La misma pantalla ofrece modos `Handheld / PDA` y `Cámara de celular`; ambos envían el valor sin transformación al mismo clasificador y comparten historial, métricas y exportación.
- Cámara requiere HTTPS (o localhost) y permiso explícito al presionar el botón de inicio. Chrome Android y Samsung Internet usan `BarcodeDetector` nativo cuando está disponible. Safari iPhone, Firefox y otros navegadores sin esa API cargan bajo demanda `barcode-detector` 3.2.2 + ZXing-WASM desde el propio servidor (sin CDN; ~43 KB JS y ~1.1 MB WASM).
- El fallback manual/lector teclado siempre permanece disponible. La cámara se detiene al detectar un valor, cambiar de modo, ocultar o cerrar la pestaña. Compatibilidad esperada no significa rendimiento idéntico: enfoque, iluminación, resolución y formato físico deben validarse con los equipos reales.
- Las métricas separan `tiempo hasta detección` (desde que cámara y detector quedan activos hasta recibir `rawValue`) de `latencia de clasificación API` (duración exclusiva del GET de clasificación). Las lecturas manuales no inventan tiempo de detección.
- La utilidad Code 128 genera localmente una imagen PNG desde texto o un SKU conocido mediante el writer de ZXing-WASM ya instalado (~27 KB JS + ~634 KB WASM, carga bajo demanda). No consulta ni escribe base de datos y permite descargar la imagen para otra pantalla o impresión.
- Publicación propuesta en el servicio existente: `https://www.control.logitec.com.mx/pda-scanner-lab.html`, sin enlace en la navegación normal. `ENABLE_PDA_SCANNER_LAB` queda en `false` por defecto; únicamente con valor explícito `true` se sirven la página y el endpoint de clasificación. Con la flag apagada ambos responden 404.
- Riesgo de instancia compartida: al activarse, cámara y ZXing-WASM consumen CPU/memoria del mismo proceso que LOGITEC CORE. La carga es bajo demanda y el diagnóstico no escribe, pero la validación física debe observar latencia y recursos antes de mantener la flag activa.
