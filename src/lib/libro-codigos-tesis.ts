// Libro de códigos precargable para la tesis doctoral sobre el régimen mexicano contra el lavado de dinero.
// Parte de la matriz analítica del protocolo (dos ejes, cuatro frentes, plano técnico/efectividad,
// naturaleza de la fuente). "Sentido", "explicación", "tipo de afirmación", "actor" y "jurisdicción"
// son añadidos operativos para la codificación, no categorías del protocolo. Los valores
// "resultado: …" y "contexto: …" de "componente" y los actores añadidos salen del piloto con 10 artículos.
// La hipótesis no se incluye a propósito: el modelo no debe ver qué resultado se espera.

import type { Category } from "./store";

const v = (value: string, definition = "") => ({ value, definition });

export const TESIS_CATEGORIES: Category[] = [
  // ----------------------------------------------------------- nivel documento
  {
    name: "tipo_documento",
    description: "Tipo de documento.",
    level: "documento",
    multiple: false,
    values: [
      v("doctrina", "artículo académico, libro o capítulo"),
      v("informe de evaluación mutua"),
      v("informe de seguimiento", "seguimiento de una evaluación mutua"),
      v("evaluación nacional de riesgos"),
      v("jurisprudencia", "sentencia, tesis o criterio judicial"),
      v("norma", "ley, reglamento, disposición o estándar"),
      v("estadística oficial"),
      v("otro"),
    ],
  },
  {
    name: "naturaleza_fuente",
    description: "Naturaleza predominante de la evidencia que aporta el documento.",
    level: "documento",
    multiple: false,
    values: [
      v("documental", "análisis de normas, informes, doctrina o resoluciones"),
      v("cuantitativa secundaria", "se apoya sobre todo en estadísticas producidas por otros"),
      v("testimonial", "se apoya sobre todo en entrevistas o declaraciones de operadores"),
    ],
  },
  {
    name: "jurisdiccion",
    description: "Ámbito que estudia el documento.",
    level: "documento",
    multiple: false,
    values: [
      v("México"),
      v("otro país"),
      v("comparado", "México frente a otros países"),
      v("internacional o general", "estándares o régimen global, sin un país concreto"),
    ],
  },
  // ----------------------------------------------------------- nivel hallazgo
  {
    name: "componente",
    description:
      "Componente del régimen al que se refiere el hallazgo (eje y subcategoría). " +
      'Si el problema probatorio está en lo que dice la norma, usa "normativo: reglas probatorias"; ' +
      'si está en la capacidad de las autoridades para reunir o integrar la prueba, usa "institucional: capacidad operativa".',
    level: "hallazgo",
    multiple: false,
    values: [
      v(
        "normativo: cobertura de las obligaciones",
        "si la norma alcanza a los sujetos, actividades u obligaciones que exigen los estándares",
      ),
      v(
        "normativo: precisión de los supuestos",
        "claridad o ambigüedad de definiciones, supuestos y umbrales",
      ),
      v(
        "normativo: coherencia entre instrumentos",
        "contradicciones o desajustes entre leyes, reglamentos, disposiciones o tratados",
      ),
      v(
        "normativo: proporcionalidad del sistema sancionador",
        "sanciones previstas: tipo, monto, gradación y capacidad disuasoria",
      ),
      v(
        "normativo: reglas probatorias",
        "reglas escritas sobre la prueba: tipo penal, carga, estándar, presunciones",
      ),
      v(
        "institucional: capacidad operativa",
        "personal, presupuesto, capacitación y tecnología de las autoridades",
      ),
      v(
        "institucional: competencias y coordinación",
        "reparto de atribuciones entre autoridades y mecanismos para coordinarse o compartir información",
      ),
      v(
        "institucional: incentivos de los operadores",
        "motivaciones de autoridades y sujetos obligados: metas, cumplimiento defensivo, riesgo reputacional, corrupción",
      ),
      v(
        "institucional: infraestructura de información",
        "registros, bases de datos, estadísticas y acceso a la información",
      ),
      v(
        "resultado: indicador de efectividad",
        "cifras o resultados del régimen (sentencias, decomisos, avisos, sanciones) sin atribuirlos a un componente",
      ),
      v(
        "contexto: amenaza o riesgo",
        "magnitud, modalidades o distribución del lavado y de sus delitos precedentes",
      ),
      v("no aplica", "el hallazgo no se refiere a ninguno de estos componentes"),
    ],
  },
  {
    name: "frente",
    description: "Frente del régimen al que se refiere el hallazgo.",
    level: "hallazgo",
    multiple: true,
    values: [
      v(
        "supervisión (RI 3)",
        "supervisión y vigilancia de sujetos obligados y actividades vulnerables",
      ),
      v(
        "investigación y persecución penal (RI 7)",
        "investigación, acusación y sentencia por lavado de dinero",
      ),
      v(
        "recuperación de activos (RI 8)",
        "aseguramiento, decomiso y extinción de dominio como vías para privar de los bienes de origen ilícito",
      ),
      v(
        "beneficiario final (R. 24)",
        "identificación y transparencia del beneficiario final o controlador de personas morales",
      ),
      v("transversal o general", "el régimen en su conjunto, sin un frente concreto"),
      v("fuera de alcance", "financiamiento al terrorismo"),
    ],
  },
  {
    name: "plano",
    description: "Plano de evaluación que aborda el hallazgo.",
    level: "hallazgo",
    multiple: false,
    values: [
      v(
        "cumplimiento técnico",
        "si existen las normas e instituciones que piden las Recomendaciones",
      ),
      v(
        "efectividad material",
        "si el régimen produce resultados en la práctica (Resultados Inmediatos)",
      ),
      v("no distingue"),
    ],
  },
  {
    name: "sentido",
    description: "Qué afirma el texto sobre el componente.",
    level: "hallazgo",
    multiple: false,
    values: [
      v("deficiencia", "una carencia, falla o problema"),
      v("avance", "un logro, mejora o fortaleza"),
      v("descripción neutra", "describe sin valorar"),
    ],
  },
  {
    name: "explicacion",
    description: "Causa a la que el propio texto atribuye lo que describe.",
    level: "hallazgo",
    multiple: false,
    values: [
      v("diseño normativo", "lo que dicen o dejan de decir las normas"),
      v(
        "condiciones de implementación",
        "cómo se aplican las normas: recursos, coordinación, incentivos, información",
      ),
      v(
        "factores externos",
        "contexto criminal, económico o político, o presiones internacionales",
      ),
      v("crítica al indicador", "cuestiona cómo se mide la efectividad"),
      v("sin explicación", "el texto no atribuye una causa"),
    ],
  },
  {
    name: "tipo_afirmacion",
    description: "Tipo de afirmación.",
    level: "hallazgo",
    multiple: false,
    values: [
      v("hallazgo empírico", "resultado de observación, entrevistas o análisis de casos"),
      v("dato cuantitativo", "cifra o estadística"),
      v("argumento doctrinal", "interpretación o tesis del autor"),
      v("descripción normativa", "lo que establece una norma"),
      v("recomendación", "propuesta de cambio"),
    ],
  },
  {
    name: "actor",
    description: "Autoridades o sujetos a los que se refiere el hallazgo.",
    level: "hallazgo",
    multiple: true,
    values: [
      v("UIF"),
      v("SAT"),
      v("FGR"),
      v("CNBV"),
      v("Poder Judicial"),
      v("sujetos obligados financieros"),
      v("actividades vulnerables", "quienes realizan actividades del art. 17 de la LFPIORPI"),
      v("SHCP"),
      v("Poder Legislativo"),
      v("autoridades estatales o municipales"),
      v("GAFI o GAFILAT"),
      v("otros organismos internacionales", "OCDE, BID, ONU, FMI u otros"),
      v("autoridades de otros países"),
      v("otro"),
      v("ninguno"),
    ],
  },
];
