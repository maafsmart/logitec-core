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

V15 implementa en DEMO READ-ONLY la separación visual entre realidad física reportada y estado administrativo. La persistencia oficial, registro de movimientos y aislamiento por identidad autenticada corresponden a la fase de integración con backend.

---

## POL-003 · Escáner transversal y autoridad por rol

**Estado:** APROBADA

### Principio

El motor de escaneo es una capacidad transversal de LOGITEC CORE WMS. La posibilidad de leer e identificar un código no implica automáticamente autoridad para modificar inventario. Las acciones disponibles después de una lectura dependen del rol, contexto y política aplicable.

### Matriz por rol

| Rol | Leer / identificar | Captura provisional | Validar | Autovalidar | Inventario |
|-----|-------------------|---------------------|---------|-------------|------------|
| **Operador** | sí | sí | no | no | solo mediante tarea autorizada |
| **Supervisor** | sí | sí | sí | sí | conforme permisos/reglas |
| **Admin** | sí | sí | sí | sí | autoridad administrativa; registro oficial en backend |
| **Cliente** | no | no | no | no | consulta READ-ONLY |

Supervisor o Administrador pueden validar una captura provisional ordinaria. No se requiere doble validación salvo política específica.

La autovalidación se determina por identidad del actor, no por rol.

Validación administrativa no equivale por sí misma a registro oficial de inventario.

### Autovalidación de Supervisor

Cuando un Supervisor ejecuta y valida su propia acción física, LOGITEC debe conservar explícitamente que:

- **ejecutor** = Supervisor
- **revisor** = mismo Supervisor
- **tipo de revisión** = Autovalidación de Supervisor
- **hora física**
- **hora administrativa**

**Nunca simular una segunda persona.**
