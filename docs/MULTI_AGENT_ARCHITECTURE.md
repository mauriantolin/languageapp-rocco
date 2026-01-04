# Arquitectura Multi-Agente - Documentación de Cambios

## Resumen

Se implementó un sistema de 4 agentes especializados para evaluar las respuestas de los estudiantes en tiempo real:

| Agente | Función | Modelo |
|--------|---------|--------|
| **Transcriptor** | Transcribe audio (Whisper) | Integrado en Realtime API |
| **Gramática** | Analiza errores gramaticales | gpt-4o |
| **Verificador** | Verifica si responde la pregunta | gpt-4o |
| **Juez** | Toma decisión final | gpt-4o |

---

## Archivos Creados

### 1. Tipos de Análisis
**Archivo:** `server/agents/types/analysisTypes.ts`

```typescript
// Tipos principales exportados:
- JudgeDecision: "advance" | "correct_and_retry" | "clarify_and_retry" | "off_topic_retry" | "ignore"
- AnalysisInput: entrada para el sistema de análisis
- GrammarAgentOutput: salida del agente de gramática
- VerifierAgentOutput: salida del agente verificador
- JudgeAgentOutput: salida del agente juez
- AnalysisOrchestratorOutput: salida del orquestador
- AnalyzeRequestBody / AnalyzeResponseBody: API request/response
```

### 2. Prompts de Agentes

#### `server/agents/prompts/grammarPrompt.ts`
- `GRAMMAR_AGENT_PROMPT`: Instrucciones para analizar errores gramaticales
- `GRAMMAR_SYSTEM_CONTEXT`: Contexto del sistema
- Detecta: contracciones, verb forms, artículos, preposiciones, word order, tiempos verbales
- Feedback en español

#### `server/agents/prompts/verifierPrompt.ts`
- `VERIFIER_AGENT_PROMPT`: Instrucciones para verificar si la respuesta contesta la pregunta
- `VERIFIER_SYSTEM_CONTEXT`: Contexto del sistema
- Clasifica: direct_answer, partial_answer, off_topic, clarification_needed, noise
- Relevance score 0-100

#### `server/agents/prompts/judgePrompt.ts`
- `JUDGE_AGENT_PROMPT`: Instrucciones para tomar decisión final
- `JUDGE_SYSTEM_CONTEXT`: Contexto del sistema
- Decisiones: advance, correct_and_retry, clarify_and_retry, off_topic_retry, ignore
- Genera `tutorInstruction` en español

### 3. Agentes

#### `server/agents/grammarAgent.ts`
```typescript
export class GrammarAgent {
  readonly name = "grammar";
  async process(input: AnalysisInput): Promise<GrammarAgentResult>
}
export const grammarAgent = new GrammarAgent();
```

#### `server/agents/verifierAgent.ts`
```typescript
export class VerifierAgent {
  readonly name = "verifier";
  async process(input: AnalysisInput): Promise<VerifierAgentResult>
}
export const verifierAgent = new VerifierAgent();
```

#### `server/agents/judgeAgent.ts`
```typescript
export class JudgeAgent {
  readonly name = "judge";
  async process(input: JudgeInput): Promise<JudgeAgentResult>
}
export const judgeAgent = new JudgeAgent();
```

### 4. Orquestador
**Archivo:** `server/orchestrator/analysisOrchestrator.ts`

```typescript
export class AnalysisOrchestrator {
  async analyze(input: AnalysisInput, includeDebug = false): Promise<AnalysisOrchestratorOutput>
}
export const analysisOrchestrator = new AnalysisOrchestrator();
```

**Flujo:**
1. Grammar + Verifier corren en **PARALELO** con `Promise.all()`
2. Judge recibe resultados de ambos y decide

### 5. Rutas de API
**Archivo:** `server/analysisRoutes.ts`

```typescript
POST /api/analysis/evaluate
GET /api/analysis/health
```

**Request:**
```json
{
  "transcription": "I like cook",
  "questionIndex": 5,
  "lessonNumber": 1,
  "sessionId": "simple_123_abc"
}
```

**Response:**
```json
{
  "success": true,
  "decision": "correct_and_retry",
  "shouldAdvance": false,
  "tutorInstruction": "Casi perfecto! Recuerda usar 'like to' antes del verbo...",
  "grammarFeedback": "I like cook → I like to cook",
  "processingTimeMs": 1340
}
```

---

## Archivos Modificados

### 1. `server/agents/prompts/index.ts`
**Cambio:** Agregadas exportaciones de nuevos prompts

```typescript
// Líneas agregadas:
export * from "./grammarPrompt";
export * from "./verifierPrompt";
export * from "./judgePrompt";
```

### 2. `server/agents/index.ts`
**Cambio:** Agregadas exportaciones de nuevos agentes

```typescript
// Líneas agregadas:
export { grammarAgent, GrammarAgent } from "./grammarAgent";
export { verifierAgent, VerifierAgent } from "./verifierAgent";
export { judgeAgent, JudgeAgent } from "./judgeAgent";
export * from "./types/analysisTypes";
```

### 3. `server/routes.ts`
**Cambio:** Registrado el router de análisis

```typescript
// Línea 12 - Import agregado:
import { analysisRouter } from "./analysisRoutes";

// Línea 770-771 - Router registrado:
// Multi-agent analysis routes
app.use("/api/analysis", analysisRouter);
```

### 4. `client/src/hooks/useSimpleConversation.ts`
**Cambios principales:**

#### Tipos agregados (líneas 5-19):
```typescript
type JudgeDecision = "advance" | "correct_and_retry" | "clarify_and_retry" | "off_topic_retry" | "ignore";

interface AnalysisResult {
  success: boolean;
  decision: JudgeDecision;
  shouldAdvance: boolean;
  tutorInstruction: string;
  grammarFeedback?: string;
  processingTimeMs: number;
}
```

#### Helper `analyzeResponse()` (líneas 21-49):
```typescript
async function analyzeResponse(
  transcription: string,
  questionIndex: number,
  sessionId: string
): Promise<AnalysisResult>
```

#### Helper `speakFeedback()` (líneas 51-66):
```typescript
async function speakFeedback(text: string): Promise<void>
```

#### Handler de transcripción modificado (líneas 247-350):
- Llama a `/api/analysis/evaluate` cuando el usuario habla
- Actúa según la decisión del Juez:
  - `advance` → TTS feedback + avanzar
  - `correct_and_retry` / `clarify_and_retry` / `off_topic_retry` → TTS corrección
  - `ignore` → No hacer nada

#### Nueva función `handleAdvanceQuestion()` (líneas 363-409):
```typescript
const handleAdvanceQuestion = async () => {
  // Avanza a la siguiente pregunta
  // Usa TTS para leer la pregunta
}
```

### 5. `client/src/hooks/useRealtimeConversation.ts`
**Cambios principales:**

#### Tipos agregados (líneas 8-23):
```typescript
type JudgeDecision = "advance" | "correct_and_retry" | "clarify_and_retry" | "off_topic_retry" | "ignore";

interface AnalysisResult {
  success: boolean;
  decision: JudgeDecision;
  shouldAdvance: boolean;
  tutorInstruction: string;
  grammarFeedback?: string;
  processingTimeMs: number;
}
```

#### Helper `analyzeResponse()` (líneas 56-84):
```typescript
async function analyzeResponse(
  transcription: string,
  questionIndex: number,
  sessionId: string
): Promise<AnalysisResult>
```

#### Handler async (línea 209):
```typescript
dc.onmessage = async (event) => {
```

#### Handler de Lesson 1 modificado (líneas 291-354):
- Llama a `/api/analysis/evaluate` cuando el usuario habla
- Actúa según la decisión del Juez
- Usa TTS para feedback y correcciones

---

## Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTE                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐          ┌─────────────────┐               │
│  │   ChatPartner   │          │   SimpleMode    │               │
│  │   (Lesson 1-2)  │          │   (52 preguntas)│               │
│  └────────┬────────┘          └────────┬────────┘               │
│           │                            │                         │
│           ▼                            ▼                         │
│  ┌─────────────────┐          ┌─────────────────┐               │
│  │useRealtimeConv. │          │useSimpleConv.   │               │
│  └────────┬────────┘          └────────┬────────┘               │
│           │                            │                         │
│           └─────────────┬──────────────┘                         │
│                         │                                        │
│              POST /api/analysis/evaluate                         │
└─────────────────────────┼────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SERVIDOR                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              analysisOrchestrator.analyze()               │   │
│  │                                                           │   │
│  │   ┌─────────────────────────────────────────────────┐    │   │
│  │   │              Promise.all()                       │    │   │
│  │   │                                                  │    │   │
│  │   │    ┌────────────────┐  ┌────────────────┐       │    │   │
│  │   │    │ Grammar Agent  │  │ Verifier Agent │       │    │   │
│  │   │    │    (gpt-4o)    │  │    (gpt-4o)    │       │    │   │
│  │   │    └───────┬────────┘  └───────┬────────┘       │    │   │
│  │   │            └──────────┬────────┘                │    │   │
│  │   └───────────────────────┼─────────────────────────┘    │   │
│  │                           ▼                               │   │
│  │                 ┌────────────────┐                        │   │
│  │                 │  Judge Agent   │                        │   │
│  │                 │    (gpt-4o)    │                        │   │
│  │                 └───────┬────────┘                        │   │
│  │                         ▼                                 │   │
│  │                    Decisión                               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Decisiones posibles:                                           │
│  ├── advance: Respuesta correcta, avanzar                       │
│  ├── correct_and_retry: Error gramática, corregir               │
│  ├── clarify_and_retry: Respuesta ambigua                       │
│  ├── off_topic_retry: Fuera de tema                             │
│  └── ignore: Ruido/silencio                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTE                                  │
│                                                                  │
│  Según decisión:                                                │
│  ├── advance → TTS: "¡Muy bien!" + siguiente pregunta           │
│  ├── correct_and_retry → TTS: corrección en español             │
│  ├── clarify_and_retry → TTS: pedir clarificación               │
│  ├── off_topic_retry → TTS: redirigir a pregunta                │
│  └── ignore → No hacer nada                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Estructura de Archivos

```
server/
├── agents/
│   ├── types/
│   │   └── analysisTypes.ts      ← NUEVO
│   ├── prompts/
│   │   ├── index.ts              ← MODIFICADO
│   │   ├── grammarPrompt.ts      ← NUEVO
│   │   ├── verifierPrompt.ts     ← NUEVO
│   │   └── judgePrompt.ts        ← NUEVO
│   ├── index.ts                  ← MODIFICADO
│   ├── grammarAgent.ts           ← NUEVO
│   ├── verifierAgent.ts          ← NUEVO
│   └── judgeAgent.ts             ← NUEVO
├── orchestrator/
│   └── analysisOrchestrator.ts   ← NUEVO
├── analysisRoutes.ts             ← NUEVO
└── routes.ts                     ← MODIFICADO

client/
└── src/
    └── hooks/
        ├── useSimpleConversation.ts      ← MODIFICADO
        └── useRealtimeConversation.ts    ← MODIFICADO
```

---

## Ejemplos de Respuestas del Sistema

### Respuesta Correcta con Buena Gramática
```json
{
  "decision": "advance",
  "shouldAdvance": true,
  "tutorInstruction": "¡Muy bien! Excelente respuesta.",
  "processingTimeMs": 1250
}
```

### Respuesta Correcta con Error Gramatical
```json
{
  "decision": "correct_and_retry",
  "shouldAdvance": false,
  "tutorInstruction": "Casi perfecto! Recuerda usar 'like to' antes del verbo. La forma correcta es: 'I like to cook'. Intenta de nuevo: Do you like to cook?",
  "grammarFeedback": "I like cook → I like to cook",
  "processingTimeMs": 1340
}
```

### Respuesta Fuera de Tema
```json
{
  "decision": "off_topic_retry",
  "shouldAdvance": false,
  "tutorInstruction": "Esa respuesta no parece relacionada con la pregunta. La pregunta era: 'Do you like to cook?'",
  "processingTimeMs": 980
}
```

### Ruido o Silencio
```json
{
  "decision": "ignore",
  "shouldAdvance": false,
  "tutorInstruction": "",
  "processingTimeMs": 200
}
```

---

## Endpoints API

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/analysis/evaluate` | POST | Evalúa respuesta del estudiante |
| `/api/analysis/health` | GET | Health check del sistema |

---

## Notas de Implementación

1. **Ejecución Paralela**: Grammar y Verifier corren simultáneamente para reducir latencia
2. **Modelo**: Se usa `gpt-4o` para todos los agentes (configurable en cada agente)
3. **JSON Mode**: Todos los agentes usan `response_format: { type: "json_object" }` para respuestas estructuradas
4. **TTS**: El feedback se reproduce con voz usando el endpoint `/api/tts/speak`
5. **Temperatura**: 0.3 para respuestas más determinísticas
