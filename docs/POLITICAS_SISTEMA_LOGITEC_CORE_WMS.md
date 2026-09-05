# POLÍTICAS DE SISTEMA · LOGITEC CORE WMS

Documento normativo del sistema LOGITEC CORE WMS. Las políticas aquí registradas están **APROBADAS** para diseño, implementación y revisión de funcionalidad operativa.

---

## POL-001 · Operación provisional de piso sin tarea asignada

**Estado:** APROBADA

### Principio

LOGITEC debe permitir resolver contingencias físicas sin convertir la improvisación humana en una modificación no autorizada del inventario.

### Flujo normativo

```
Operador sin tarea
  → Escaneo libre controlado
  → Captura provisional de piso
  → Pendiente de supervisión
  → Supervisor revisa / clasifica
  → Aprueba / corrige / rechaza
  → Movimiento oficial
```

### El Operador puede

- escanear;
- identificar;
- documentar;
- declarar una acción física;
- ejecutar una contingencia física;
- solicitar su regularización.

### El Operador NO puede

- modificar stock oficial;
- aprobar su propia captura;
- confirmar oficialmente entrada/salida;
- asignarse permisos de Supervisor;
- convertir por sí mismo una captura provisional en movimiento oficial.

### Evidencia obligatoria (conservar cuando exista)

- hora física;
- operador;
- dispositivo;
- valor RAW exacto;
- clasificación propuesta;
- SKU / lote / serie / SAP / pedido / partida;
- origen;
- destino;
- cantidad solo con contexto suficiente;
- acción declarada;
- observación;
- secuencia completa de escaneos;
- estado administrativo.

**Nunca reescribir la evidencia RAW original.**

### Distinción temporal

- **Hora física de ejecución** ≠ **hora administrativa de autorización**

---

## POL-002 · Transparencia al Cliente de acciones provisionales

**Estado:** APROBADA

### Principio

Cuando una acción física relacionada con mercancía del Cliente haya ocurrido, incluso si todavía está pendiente de regularización administrativa, LOGITEC debe poder distinguir y posteriormente mostrar:

- realidad física reportada;
- estado administrativo;
- quién solicitó;
- quién ejecutó;
- quién supervisó;
- hora física;
- hora administrativa;
- ubicación física reportada;
- ubicación oficial cuando se regularice.

### Estados conceptuales

```
Reportado → Ejecutado físicamente → Pendiente de supervisión → Validado → Registrado
```

### Excepciones

- Requiere aclaración
- Rechazado administrativamente

### Mientras no exista autorización

- **NO** alterar ubicación/saldo oficial;
- **SÍ** permitir identificar claramente una **Ubicación física reportada**;
- conservar evidencia de que existe una acción física pendiente.

### Alcance Cliente

El Cliente solo podrá consultar datos correspondientes a sus proyectos/pedidos autorizados.

### Nota de implementación

No implementar todavía Modo Cliente V15. POL-002 se documenta ahora para utilizarla al diseñar Cliente después de aprobar V14.
