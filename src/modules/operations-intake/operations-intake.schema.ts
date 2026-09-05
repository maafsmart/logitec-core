export type FieldKind =
  | "choice"
  | "multi"
  | "text"
  | "textarea"
  | "time"
  | "project-cards"
  | "project-select"
  | "project-answer-grid";

export type IntakeField = {
  id: string;
  label: string;
  kind: FieldKind;
  options?: string[];
  optionalFlags?: boolean;
  attachments?: boolean;
  placeholder?: string;
  showIf?: { fieldId: string; equals: string | string[] };
  help?: string;
  projectSourceFieldId?: string;
  projectAnswerOptions?: string[];
};

export type IntakeSection = {
  id: string;
  title: string;
  intro?: string;
  fields: IntakeField[];
  sectionAttachments?: boolean;
};

export const RESPONDENT_OPTIONS = [
  "Hugo",
  "Ricardo",
  "Alejandro",
  "Representante AVIAT / Implant",
  "Varias personas",
  "Otro"
] as const;

export const UNKNOWN_FLAGS = [
  "No lo sabemos todavía",
  "Prefiero definirlo después",
  "Esta pregunta requiere explicación adicional",
  "Prefiero no contestar por este medio",
  "Prefiero comentarlo personalmente",
  "No considero que esta información sea necesaria",
  "Pendiente por definir"
] as const;

export const NAME_SKIP_OPTIONS = [
  "Sí, puedo indicarlo",
  "Prefiero no proporcionar este dato en el formulario",
  "Prefiero comentarlo personalmente",
  "No es necesario para esta definición"
] as const;

export const AVIAT_NAME_SKIP_OPTIONS = [
  "Sí, puedo indicarlo",
  "Prefiero no proporcionar nombres aquí",
  "Prefiero comentarlo personalmente",
  "No es necesario para el sistema"
] as const;

export const RESPONSE_MODE_OPTIONS = [
  "Lo puedo responder aquí",
  "Prefiero comentarlo personalmente",
  "Prefiero no responderlo por este medio",
  "No es necesario para configurar el sistema",
  "Pendiente por definir"
] as const;

/** Proyectos/clientes AVIAT conocidos en LOGITEC (excluye FREE_TO_SALE). */
export const OPERATIONS_INTAKE_PROJECTS = [
  { code: "ATT", name: "AT&T" },
  { code: "TELCEL", name: "Telcel" },
  { code: "MOVISTAR", name: "Movistar" },
  { code: "AT&T-MX", name: "AT&T México" }
];

const opt = (options: string[], extra?: Partial<IntakeField>): IntakeField => ({
  id: extra?.id || "",
  label: extra?.label || "",
  kind: extra?.kind || "choice",
  options,
  optionalFlags: extra?.optionalFlags ?? true,
  ...extra
});

const horarioOperativoSection: IntakeSection = {
  id: "horario-operativo",
  title: "Sección 11 — Horario operativo y eventualidades",
  fields: [
    opt(["8:00 a. m.", "9:00 a. m.", "Otra"], { id: "startWeekday", label: "Hora habitual de inicio lunes a viernes" }),
    opt(["6:00 p. m.", "Otra"], { id: "endWeekday", label: "Hora habitual de salida" }),
    opt(["5:45 p. m.", "5:50 p. m.", "Otra"], { id: "operationalClose", label: "¿A qué hora comienza normalmente el cierre operativo de la jornada?" }),
    opt(["Uno", "Más de uno", "Variable"], { id: "shiftCount", label: "Número de turnos" }),
    opt(["2:00–3:00 p. m.", "3:00–4:00 p. m.", "Variable", "Otro"], { id: "lunchWindow", label: "Horario de comida" }),
    opt(
      ["Se detiene toda la operación", "Se rota personal", "Continúa parcialmente", "Continúa normalmente", "Otro"],
      { id: "lunchBehavior", label: "Durante comida" }
    ),
    opt(["Sí", "No, solo en determinados horarios", "Depende del cliente/proyecto"], {
      id: "receptionAllDay",
      label: "Recepción: ¿puede realizarse durante toda la jornada?"
    }),
    {
      id: "receptionHours",
      label: "Si recepción no es toda la jornada, indique horarios",
      kind: "textarea",
      optionalFlags: true,
      showIf: { fieldId: "receptionAllDay", equals: "No, solo en determinados horarios" }
    },
    opt(
      ["Sí", "No, solo en determinados horarios", "Depende del pedido", "Depende del transportista", "Depende del cliente/proyecto", "Otro"],
      { id: "outboundPrepAllDay", label: "Preparación de salida: ¿puede realizarse durante toda la jornada?" }
    ),
    opt(["No", "Durante comida", "Durante cierre", "Durante inventario/conteo", "Otro"], {
      id: "noMovementWindows",
      label: "¿Existen horarios o momentos donde NO deben hacerse movimientos?"
    }),
    opt(
      ["Se termina aunque exceda horario", "Se detiene y continúa al día siguiente", "Solo se termina si ya comenzó físicamente", "Depende del proceso", "Otro"],
      { id: "closeInProgressOp", label: "Si una operación ya comenzó poco antes del cierre operativo" }
    ),
    opt(["Sí", "No", "Solo en emergencia"], { id: "afterHoursOpen", label: "¿Puede abrirse la bodega fuera del horario normal?" }),
    { id: "afterHoursAuthorizer", label: "¿Quién autoriza apertura fuera de horario?", kind: "text", optionalFlags: true },
    opt(["Sí", "No", "Depende de la contingencia"], {
      id: "exceptionalShift",
      label: "¿Puede habilitarse un segundo o tercer turno excepcional?"
    }),
    { id: "exceptionalShiftParticipants", label: "¿Quién participa en turno excepcional?", kind: "textarea", optionalFlags: true },
    { id: "exceptionalShiftDocumentation", label: "¿Cómo se documenta turno excepcional?", kind: "textarea", optionalFlags: true }
  ]
};

const personasRolesSection: IntakeSection = {
  id: "personas-roles",
  title: "Sección 12 — Personas y roles",
  intro:
    "Indique únicamente lo necesario para configurar permisos y responsabilidades. No es obligatorio compartir datos personales por este medio.",
  fields: [
    {
      id: "rolesPresent",
      label: "¿Qué personas o roles participan actualmente en la operación que estamos documentando?",
      kind: "multi",
      options: ["Hugo", "Ricardo", "Alejandro", "Representante AVIAT / Implant", "Operadores", "Supervisores", "Otros"],
      optionalFlags: true,
      help: "Seleccione todas las opciones que correspondan. Después podremos definir únicamente las responsabilidades necesarias para configurar correctamente el sistema."
    },
    opt([...NAME_SKIP_OPTIONS], { id: "hugoNamePreference", label: "Si desea, indique el nombre completo de Hugo" }),
    {
      id: "hugoFullName",
      label: "Nombre completo de Hugo",
      kind: "text",
      optionalFlags: true,
      showIf: { fieldId: "hugoNamePreference", equals: "Sí, puedo indicarlo" }
    },
    opt([...NAME_SKIP_OPTIONS], { id: "ricardoNamePreference", label: "Si desea, indique el nombre completo de Ricardo" }),
    {
      id: "ricardoFullName",
      label: "Nombre completo de Ricardo",
      kind: "text",
      optionalFlags: true,
      showIf: { fieldId: "ricardoNamePreference", equals: "Sí, puedo indicarlo" }
    },
    opt([...NAME_SKIP_OPTIONS], { id: "alejandroNamePreference", label: "Si desea, indique el nombre completo de Alejandro" }),
    {
      id: "alejandroFullName",
      label: "Nombre completo de Alejandro",
      kind: "text",
      optionalFlags: true,
      showIf: { fieldId: "alejandroNamePreference", equals: "Sí, puedo indicarlo" }
    },
    opt(
      ["Representante AVIAT", "Implant", "Supervisor AVIAT", "Otro", "No existe un nombre definido", "Prefiero definirlo personalmente"],
      { id: "aviatFloorRoleName", label: "¿Cómo llaman actualmente al personal de AVIAT que participa directamente en piso?" }
    ),
    {
      id: "aviatFloorRoleOther",
      label: "Especifique otro nombre usado en piso",
      kind: "text",
      optionalFlags: true,
      showIf: { fieldId: "aviatFloorRoleName", equals: "Otro" }
    },
    opt(
      ["Representante AVIAT", "Implant", "Supervisor AVIAT", "Otro", "No existe un nombre definido", "Prefiero definirlo personalmente"],
      { id: "aviatLogitecRoleName", label: "¿Cuál debería ser el nombre de este rol dentro de LOGITEC Core WMS?" }
    ),
    {
      id: "aviatLogitecRoleOther",
      label: "Especifique otro nombre para LOGITEC Core WMS",
      kind: "text",
      optionalFlags: true,
      showIf: { fieldId: "aviatLogitecRoleName", equals: "Otro" }
    },
    opt([...AVIAT_NAME_SKIP_OPTIONS], {
      id: "aviatPersonNamePreference",
      label: "Si considera útil identificar a la persona, puede indicar su nombre."
    }),
    {
      id: "aviatOptionalPersonName",
      label: "Nombre de la persona (opcional)",
      kind: "text",
      optionalFlags: true,
      showIf: { fieldId: "aviatPersonNamePreference", equals: "Sí, puedo indicarlo" }
    },
    opt(
      [
        "Sí, normalmente participa una persona",
        "Sí, pueden participar varias",
        "No es relevante para el sistema",
        "Prefiero comentarlo personalmente",
        "No sabemos todavía"
      ],
      {
        id: "aviatMultipleImportant",
        label: "¿Es importante para la operación distinguir si participa una o varias personas de AVIAT en piso?"
      }
    ),
    {
      id: "aviatMultipleDetail",
      label: "Cantidad aproximada o forma en que se organizan",
      kind: "textarea",
      optionalFlags: true,
      showIf: {
        fieldId: "aviatMultipleImportant",
        equals: ["Sí, normalmente participa una persona", "Sí, pueden participar varias"]
      }
    },
    opt([...RESPONSE_MODE_OPTIONS], {
      id: "roleActivitiesMode",
      label: "Actividades que realiza cada rol relevante",
      help: "Para configurar correctamente permisos y responsabilidades en el sistema, indique únicamente lo que considere necesario."
    }),
    {
      id: "roleActivities",
      label: "Detalle de actividades por rol",
      kind: "textarea",
      optionalFlags: true,
      showIf: { fieldId: "roleActivitiesMode", equals: "Lo puedo responder aquí" }
    },
    opt([...RESPONSE_MODE_OPTIONS], { id: "roleCanAuthorizeMode", label: "Qué puede autorizar cada rol relevante" }),
    {
      id: "roleCanAuthorize",
      label: "Detalle de autorizaciones por rol",
      kind: "textarea",
      optionalFlags: true,
      showIf: { fieldId: "roleCanAuthorizeMode", equals: "Lo puedo responder aquí" }
    },
    opt([...RESPONSE_MODE_OPTIONS], { id: "roleNeedsAuthorizationMode", label: "Qué requiere autorización de otra persona" }),
    {
      id: "roleNeedsAuthorization",
      label: "Detalle de procesos que requieren autorización",
      kind: "textarea",
      optionalFlags: true,
      showIf: { fieldId: "roleNeedsAuthorizationMode", equals: "Lo puedo responder aquí" }
    },
    opt([...RESPONSE_MODE_OPTIONS], { id: "roleAuthorizationFromMode", label: "De quién requiere autorización" }),
    {
      id: "roleAuthorizationFrom",
      label: "Detalle de quién autoriza a quién",
      kind: "textarea",
      optionalFlags: true,
      showIf: { fieldId: "roleAuthorizationFromMode", equals: "Lo puedo responder aquí" }
    }
  ]
};

export const OPERATIONS_INTAKE_SECTIONS: IntakeSection[] = [
  {
    id: "recepcion-real",
    title: "Sección 1 — Recepción real de mercancía",
    intro:
      "Queremos entender cómo llega físicamente la mercancía y qué pasos realizan antes de registrarla en el sistema.",
    fields: [
      opt(
        [
          "Ya viene con una etiqueta utilizable para operar",
          "Viene identificada, pero requiere una nueva etiqueta",
          "Llega sin etiqueta",
          "Depende del cliente/proyecto",
          "Depende del tipo de mercancía",
          "Otro"
        ],
        {
          id: "arrivalLabelState",
          label: "¿Cómo llega normalmente identificada la mercancía cuando la reciben?",
          help: "Seleccione la opción que mejor describa la operación habitual."
        }
      ),
      {
        id: "arrivalByProjectProjects",
        label: "Indique qué clientes/proyectos AVIAT aplican",
        kind: "project-select",
        optionalFlags: true,
        showIf: { fieldId: "arrivalLabelState", equals: "Depende del cliente/proyecto" }
      },
      {
        id: "arrivalByProjectAnswers",
        label: "Por cada proyecto seleccionado, ¿cómo llega normalmente?",
        kind: "project-answer-grid",
        optionalFlags: true,
        projectSourceFieldId: "arrivalByProjectProjects",
        projectAnswerOptions: [
          "Ya viene etiquetada",
          "Requiere nueva etiqueta",
          "Llega sin etiqueta",
          "Depende del material",
          "Otro"
        ],
        showIf: { fieldId: "arrivalLabelState", equals: "Depende del cliente/proyecto" }
      },
      opt(
        ["Etiqueta", "Hoja física", "Excel", "Pedido", "SAP", "Partida", "Descripción", "Documentación de AVIAT", "Comunicación verbal", "Otra"],
        {
          id: "arrivalInformation",
          label: "¿Qué información o documentación suele acompañar la mercancía cuando llega?",
          kind: "multi"
        }
      ),
      {
        id: "arrivalInformationOther",
        label: "Otro (especifique)",
        kind: "text",
        optionalFlags: true,
        placeholder: "Describa brevemente",
        showIf: { fieldId: "arrivalInformation", equals: "Otra" }
      },
      opt(
        [
          "Documento físico",
          "Excel",
          "Pedido",
          "SAP",
          "Partida",
          "Descripción",
          "Revisión visual",
          "Información proporcionada por AVIAT",
          "Consulta con otra persona",
          "Otro"
        ],
        {
          id: "unknownIdentificationMethod",
          label: "Si la mercancía llega sin una identificación suficiente, ¿cómo determinan exactamente qué producto es?",
          kind: "multi"
        }
      ),
      opt(
        ["Logitec", "AVIAT", "Cliente final de AVIAT", "Depende del proyecto", "Otro", "No sabemos todavía"],
        {
          id: "labelGenerator",
          label: "Cuando se necesita una nueva etiqueta, ¿quién la genera?",
          kind: "multi"
        }
      ),
      {
        id: "labelGeneratorProjects",
        label: "Indique para qué proyectos/clientes aplica la generación",
        kind: "project-select",
        optionalFlags: true,
        showIf: { fieldId: "labelGenerator", equals: "Depende del proyecto" }
      },
      opt(
        ["Logitec", "AVIAT", "Cliente final de AVIAT", "Depende del proyecto", "Otro", "No sabemos todavía"],
        {
          id: "labelApplier",
          label: "¿Quién coloca físicamente la etiqueta en la mercancía?",
          kind: "multi"
        }
      ),
      {
        id: "labelApplierProjects",
        label: "Indique para qué proyectos/clientes aplica la colocación",
        kind: "project-select",
        optionalFlags: true,
        showIf: { fieldId: "labelApplier", equals: "Depende del proyecto" }
      },
      opt(["Sí", "No", "Depende del proyecto", "No sabemos todavía"], {
        id: "readyToScan",
        label: "¿Hay clientes/proyectos cuya mercancía ya llega lista para escanear sin que Logitec tenga que etiquetarla nuevamente?"
      }),
      {
        id: "readyToScanProjects",
        label: "Seleccione los proyectos/clientes que ya llegan listos para escanear",
        kind: "project-select",
        optionalFlags: true,
        showIf: { fieldId: "readyToScan", equals: ["Sí", "Depende del proyecto"] }
      },
      opt(
        [
          "Revisar documentación",
          "Revisar Excel",
          "Identificar producto",
          "Confirmar pedido",
          "Confirmar SAP",
          "Confirmar partida",
          "Contar piezas",
          "Revisar físicamente mercancía",
          "Validar con AVIAT",
          "Otro"
        ],
        {
          id: "beforeLabeling",
          label: "Antes de generar o colocar una etiqueta, ¿qué pasos realizan normalmente?",
          kind: "multi"
        }
      ),
      opt(
        [
          "Escanear",
          "Validar datos",
          "Capturar cantidad",
          "Asignar proyecto",
          "Pasar a Buffer de entrada",
          "Asignar ubicación definitiva",
          "Supervisión / validación",
          "Otro"
        ],
        {
          id: "afterLabeling",
          label: "Una vez que la mercancía ya está correctamente etiquetada, ¿qué paso sigue normalmente?",
          kind: "multi"
        }
      ),
      {
        id: "afterLabelingOrder",
        label: "Si existe un orden específico, descríbalo brevemente",
        kind: "text",
        optionalFlags: true,
        placeholder: "Ej. escanear → validar → pasar a Buffer"
      },
      opt(
        ["Por pieza", "Por caja", "Por lote", "Por pedido", "Depende del proyecto", "No lo medimos actualmente", "Otro"],
        { id: "labelingDurationUnit", label: "¿Cómo miden normalmente el tiempo que lleva etiquetar la mercancía?" }
      ),
      {
        id: "labelingDuration",
        label: "Tiempo aproximado",
        kind: "text",
        optionalFlags: true,
        placeholder: "Ej. 2 min por caja, 30 seg por pieza"
      },
      {
        id: "labelingDurationByProject",
        label: "Si depende del proyecto, indique tiempos o comentarios por cliente/proyecto",
        kind: "textarea",
        optionalFlags: true,
        showIf: { fieldId: "labelingDurationUnit", equals: "Depende del proyecto" }
      },
      opt(["Sí", "No", "A veces", "Depende del proyecto", "No sabemos todavía"], {
        id: "labelingSupervision",
        label: "¿Después del etiquetado alguien debe revisar o validar la mercancía antes de continuar?"
      }),
      {
        id: "labelingSupervisor",
        label: "¿Quién realiza esa validación?",
        kind: "text",
        optionalFlags: true,
        placeholder: "Ej. supervisor de turno, AVIAT, Hugo",
        showIf: { fieldId: "labelingSupervision", equals: ["Sí", "A veces", "Depende del proyecto"] }
      },
      {
        id: "receptionMissingStep",
        label:
          "¿Hay algún paso que ocurra desde que llega la mercancía hasta que queda lista para registrarse o ubicarse y que no hayamos mencionado?",
        kind: "textarea",
        optionalFlags: true,
        placeholder: "Describa brevemente cualquier paso adicional"
      }
    ],
    sectionAttachments: true
  },
  {
    id: "proyectos-etiquetas",
    title: "Sección 2 — Clientes/proyectos AVIAT y etiquetas",
    intro: "Ficha independiente por proyecto/cliente. FREE_TO_SALE no se trata como cliente/proyecto.",
    fields: [
      {
        id: "projectCards",
        label: "Ficha por proyecto/cliente",
        kind: "project-cards",
        optionalFlags: true,
        attachments: true
      },
      opt(["Sí", "No", "No sabemos"], {
        id: "sharedLabelFormat",
        label: "¿Hay clientes/proyectos que comparten exactamente el mismo formato de etiqueta?"
      }),
      {
        id: "sharedLabelFormatProjects",
        label: "Si comparten formato, indique cuáles",
        kind: "textarea",
        optionalFlags: true,
        showIf: { fieldId: "sharedLabelFormat", equals: "Sí" }
      }
    ],
    sectionAttachments: true
  },
  {
    id: "buffer-entrada",
    title: "Sección 3 — Buffer de entrada",
    fields: [
      opt(["Sí", "No"], { id: "bufferInNameOk", label: '¿"Buffer de entrada" es el nombre correcto para mostrar?' }),
      { id: "bufferInPreferredName", label: "Nombre preferido si no es Buffer de entrada", kind: "text", optionalFlags: true, showIf: { fieldId: "bufferInNameOk", equals: "No" } },
      opt(["Sí", "No", "Pendiente"], { id: "bufferInOfficialCode", label: "¿Existe código/clave oficial?" }),
      opt(["Sí", "No"], { id: "warehouseTultitlan", label: "Almacén Tultitlán — confirmar" }),
      opt(["Sí", "No, varias zonas"], { id: "bufferInSingleLocation", label: "¿Es una sola ubicación física?" }),
      opt(["Sí", "No", "Sí, con límite de tiempo"], {
        id: "bufferInTemporaryStay",
        label: "¿Puede permanecer mercancía temporalmente sin ubicación definitiva?"
      }),
      { id: "bufferInTemporaryLimit", label: "Si hay límite de tiempo, indíquelo", kind: "text", optionalFlags: true },
      opt(["Antes del Buffer", "Dentro del Buffer", "Después"], { id: "identificationTiming", label: "¿El proceso de identificación ocurre…?" }),
      opt(["Antes", "Dentro", "Después"], { id: "labelingTiming", label: "¿El etiquetado ocurre…?" }),
      opt(["Antes", "Dentro", "Después"], { id: "validationTiming", label: "¿La validación ocurre…?" }),
      { id: "bufferInEntryConditions", label: "Condiciones para entrar al Buffer", kind: "textarea", optionalFlags: true, attachments: true }
    ],
    sectionAttachments: true
  },
  {
    id: "mover-reubicar",
    title: "Sección 4 — Mover / Reubicar",
    intro: "Mover/Reubicar = mercancía ya registrada que cambia de ubicación física o lógica.",
    fields: [
      opt(
        ["Cambio de ubicación", "Consolidación", "Liberar espacio", "Corrección", "Cambio de proyecto", "Preparación de salida", "Reorganización", "Otro"],
        { id: "moveReasons", label: "Motivos reales de movimiento", kind: "multi" }
      ),
      { id: "moveOrderer", label: "¿Quién puede ordenar el movimiento?", kind: "textarea", optionalFlags: true },
      { id: "moveExecutor", label: "¿Quién puede ejecutarlo?", kind: "textarea", optionalFlags: true },
      { id: "moveNeedsAuthorization", label: "¿Requiere autorización?", kind: "choice", options: ["Sí", "No", "A veces", "No sabemos"] },
      { id: "moveAuthorizer", label: "¿De quién?", kind: "text", optionalFlags: true },
      { id: "moveForbiddenCases", label: "Movimientos que NO deben permitirse", kind: "textarea", optionalFlags: true }
    ]
  },
  {
    id: "preparar-salida",
    title: "Sección 5 — Preparar salida / Buffer de salida",
    intro: "Preparar salida = mercancía almacenada que se aparta/mueve hacia la zona de salida para despacho.",
    fields: [
      opt(
        ["Pedido confirmado", "Validación", "Conteo", "Etiquetado", "Documentación", "Autorización", "Supervisión", "Otro"],
        { id: "outboundPrerequisites", label: "¿Qué debe ocurrir antes?", kind: "multi" }
      ),
      opt(["Buffer de salida", "Otro"], { id: "bufferOutOfficialName", label: "Nombre oficial del Buffer de salida" }),
      { id: "bufferOutCode", label: "Código/clave Buffer de salida", kind: "text", optionalFlags: true },
      opt(["Una", "Varias"], { id: "bufferOutZoneCount", label: "¿Una o varias zonas?" }),
      opt(
        ["Al entrar al Buffer", "Después de validación", "Después de documentación", "Después de autorización", "Depende", "Otro"],
        { id: "readyForDispatch", label: "¿Cuándo se considera mercancía lista para despacho?" }
      )
    ],
    sectionAttachments: true
  },
  {
    id: "procesos-administrativos",
    title: "Sección 6 — Procesos administrativos y adicionales",
    fields: [
      opt(
        [
          "Asignar proyecto",
          "Cambiar proyecto",
          "FREE_TO_SALE",
          "Cambio de precio",
          "Almacenaje puro",
          "Validación visual",
          "Supervisión",
          "Auditoría",
          "Inventario",
          "Conteo",
          "Reetiquetado",
          "Otro"
        ],
        { id: "adminProcesses", label: "Procesos que existen", kind: "multi" }
      ),
      { id: "adminProcessDetails", label: "Por proceso seleccionado: quién lo realiza, autoriza, cuándo, frecuencia y evidencia", kind: "textarea", optionalFlags: true }
    ]
  },
  {
    id: "excepciones",
    title: "Sección 7 — Excepciones",
    fields: [
      opt(
        [
          "Mercancía sin etiqueta",
          "Etiqueta ilegible",
          "Información incompleta",
          "Físico ≠ Excel",
          "Cantidad diferente",
          "Datos que no coinciden",
          "Producto no identificado",
          "Mercancía sin proyecto",
          "Documentación faltante",
          "Devolución",
          "Incidencia",
          "Daño",
          "Otro"
        ],
        { id: "exceptionCases", label: "Casos excepcionales", kind: "multi" }
      ),
      { id: "exceptionProcedures", label: "Procedimiento actual por caso (breve)", kind: "textarea", optionalFlags: true }
    ]
  },
  {
    id: "inventario-auditorias",
    title: "Sección 8 — Inventario y auditorías",
    fields: [
      opt(["Sí", "No"], { id: "physicalCounts", label: "¿Realizan conteos físicos?" }),
      { id: "countFrequency", label: "Frecuencia de conteos", kind: "text", optionalFlags: true },
      { id: "countPerformer", label: "¿Quién cuenta?", kind: "text", optionalFlags: true },
      { id: "countValidator", label: "¿Quién valida?", kind: "text", optionalFlags: true },
      opt(["Sí", "No", "Parcialmente"], { id: "countStopsOps", label: "¿Durante conteo se detiene operación?" }),
      { id: "differenceHandling", label: "¿Cómo manejan diferencias?", kind: "textarea", optionalFlags: true },
      { id: "differenceEvidence", label: "¿Qué evidencia requieren?", kind: "textarea", optionalFlags: true },
      opt(["Internas", "AVIAT", "Cliente final", "Otras"], { id: "auditTypes", label: "¿Existen auditorías?", kind: "multi" })
    ]
  },
  {
    id: "reportes-cortes",
    title: "Sección 9 — Reportes y cortes",
    intro: "LOGITEC Core WMS tendrá inventario en tiempo real, pero necesitamos conocer qué reportes formales seguirán siendo necesarios.",
    fields: [
      { id: "mondayReport", label: "Lunes — ¿reporte/corte?, hora, cliente/proyecto, generador, receptor, contenido", kind: "textarea", optionalFlags: true },
      { id: "tuesdayReport", label: "Martes — ¿reporte/corte?, hora, cliente/proyecto, generador, receptor, contenido", kind: "textarea", optionalFlags: true },
      { id: "wednesdayReport", label: "Miércoles — ¿reporte/corte?, hora, cliente/proyecto, generador, receptor, contenido", kind: "textarea", optionalFlags: true },
      { id: "thursdayReport", label: "Jueves — ¿reporte/corte?, hora, cliente/proyecto, generador, receptor, contenido", kind: "textarea", optionalFlags: true },
      { id: "fridayReport", label: "Viernes — ¿reporte/corte?, hora, cliente/proyecto, generador, receptor, contenido", kind: "textarea", optionalFlags: true },
      opt(["Sí", "No", "A veces", "No sabemos"], { id: "mondayCutExists", label: "¿Existe actualmente reporte los lunes?" }),
      opt(["Sí", "No", "A veces", "No sabemos"], { id: "wednesdayCutExists", label: "¿Existe actualmente reporte los miércoles?" }),
      opt(["Sí", "No", "A veces", "No sabemos"], { id: "fridayCutExists", label: "¿Existe actualmente reporte los viernes?" })
    ]
  },
  {
    id: "prioridad-frecuencia",
    title: "Sección 10 — Prioridad y frecuencia",
    fields: [
      opt(
        [
          "Recepción",
          "Identificación",
          "Etiquetado",
          "Validación",
          "Registro",
          "Ubicación",
          "Mover/Reubicar",
          "Preparar salida",
          "Inventario",
          "Auditoría",
          "Proyecto",
          "FREE_TO_SALE",
          "Otros"
        ],
        { id: "priorityProcesses", label: "Procesos a evaluar", kind: "multi" }
      ),
      { id: "priorityMatrix", label: "Por proceso: importancia (crítica/alta/media/baja), frecuencia, quién realiza y quién autoriza", kind: "textarea", optionalFlags: true }
    ]
  },
  horarioOperativoSection,
  personasRolesSection,
  {
    id: "procesos-no-contemplados",
    title: "Sección 13 — Procesos no contemplados",
    intro:
      "Flujo resumido: Recepción → identificación → etiquetado → validación → registro → Buffer de entrada → ubicación → movimientos → preparación de salida → Buffer de salida → despacho → excepciones → inventario → reportes.",
    fields: [
      { id: "missingSteps", label: "¿Existe algún paso/actividad/autorización/documento/proceso que realizan y no aparece?", kind: "textarea", optionalFlags: true }
    ]
  }
];

export function sectionTitleMap(): Record<string, string> {
  return Object.fromEntries(OPERATIONS_INTAKE_SECTIONS.map((section) => [section.id, section.title]));
}
