/**
 * Eigent Local Models Integration
 * 
 * Suporte a modelos locais (Ollama, LM Studio, Llama.cpp).
 * Permite rodar agentes sem depender de APIs externas.
 * 
 * @version 1.0.0
 */

import { z } from 'zod';

// ===== Types =====

export const LocalModelProvider = z.enum(['ollama', 'lmstudio', 'llamacpp']);
export type LocalModelProvider = z.infer<typeof LocalModelProvider>;

export const LocalModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: LocalModelProvider,
  
  // Model info
  size: z.number(), // params em billions
  quantization: z.enum(['q2_k', 'q4_0', 'q5_0', 'q8_0', 'f16', 'f32']),
  contextLength: z.number(),
  
  // Status
  status: z.enum(['available', 'downloading', 'loading', 'ready', 'error']),
  progress: z.number().optional(),
  
  // Requirements
  gpuVRAM: z.number(), // MB
  ramRequired: z.number(), // MB
  
  // Tags
  tags: z.array(z.string()),
  
  // Capabilities
  supportsStreaming: z.boolean().default(true),
  supportsFunctionCalling: z.boolean().default(false),
  supportsVision: z.boolean().default(false),
});

export type LocalModel = z.infer<typeof LocalModelSchema>;

// ===== Ollama Integration =====

export class OllamaClient {
  private baseUrl: string;
  
  constructor(baseUrl: string = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
  }
  
  /**
   * Lista modelos disponíveis localmente
   */
  async listModels(): Promise<LocalModel[]> {
    const response = await fetch(`${this.baseUrl}/api/tags`);
    const data = await response.json();
    
    return data.models.map((model: any) => ({
      id: model.name,
      name: model.name,
      provider: 'ollama' as const,
      size: model.size,
      quantization: 'q4_0', // default
      contextLength: model.modelInfo?.contextLength || 4096,
      status: 'available' as const,
      gpuVRAM: Math.round(model.size / 1e9 * 1024), // estimate
      ramRequired: Math.round(model.size / 1e9 * 2048),
      tags: [],
      supportsStreaming: true,
    }));
  }
  
  /**
   * Baixa um modelo
   */
  async pullModel(modelName: string, onProgress?: (progress: number) => void): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
    });
    
    if (!response.body) throw new Error('No response body');
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value);
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const progress = JSON.parse(line);
          if (progress.status === 'downloading' && progress.progress) {
            onProgress?.(progress.progress);
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
  
  /**
   * Gera resposta com streaming
   */
  async* generate(
    model: string,
    prompt: string,
    options?: {
      temperature?: number;
      topP?: number;
      topK?: number;
      seed?: number;
      numGPU?: number;
      numCtx?: number;
    }
  ): AsyncGenerator<string, void, unknown> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: true,
        options: {
          temperature: options?.temperature ?? 0.7,
          top_p: options?.topP,
          top_k: options?.topK,
          seed: options?.seed,
          num_gpu: options?.numGPU,
          num_ctx: options?.numCtx,
        },
      }),
    });
    
    if (!response.body) throw new Error('Streaming not supported');
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const data = JSON.parse(line);
          if (data.response) {
            yield data.response;
          }
        } catch {
          // Skip
        }
      }
    }
  }
  
  /**
   * Gera embedding
   */
  async embed(model: string, input: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: input }),
    });
    
    const data = await response.json();
    return data.embedding;
  }
  
  /**
   * Check se Ollama está rodando
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, { 
        method: 'HEAD',
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// ===== LM Studio Integration =====

export class LMStudioClient {
  private baseUrl: string;
  
  constructor(baseUrl: string = 'http://localhost:1234/v1') {
    this.baseUrl = baseUrl;
  }
  
  async listModels(): Promise<LocalModel[]> {
    const response = await fetch(`${this.baseUrl}/models`);
    const data = await response.json();
    
    return data.data.map((model: any) => ({
      id: model.id,
      name: model.id,
      provider: 'lmstudio' as const,
      size: model.size,
      quantization: 'q4_0',
      contextLength: model.contextLength || 4096,
      status: 'available' as const,
      gpuVRAM: 0,
      ramRequired: 0,
      tags: [],
      supportsStreaming: true,
      supportsFunctionCalling: true,
    }));
  }
  
  async* generate(
    model: string,
    messages: { role: string; content: string }[],
    onToken?: (token: string) => void
  ): AsyncGenerator<string, void, unknown> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
    });
    
    const reader = response.body?.getReader();
    if (!reader) return;
    
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        
        const dataStr = line.slice(6);
        if (dataStr === '[DONE]') break;
        
        try {
          const data = JSON.parse(dataStr);
          const token = data.choices?.[0]?.delta?.content;
          if (token) {
            onToken?.(token);
            yield token;
          }
        } catch {}
      }
    }
  }
  
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// ===== Unified Local Models API =====

export class LocalModelsManager {
  private ollama: OllamaClient;
  private lmstudio: LMStudioClient;
  private activeProvider: LocalModelProvider | null = null;
  
  constructor() {
    this.ollama = new OllamaClient();
    this.lmstudio = new LMStudioClient();
  }
  
  /**
   * Detecta provedores disponíveis
   */
  async detectProviders(): Promise<{ ollama: boolean; lmstudio: boolean }> {
    const [ollamaOk, lmstudioOk] = await Promise.all([
      this.ollama.healthCheck(),
      this.lmstudio.healthCheck(),
    ]);
    
    if (ollamaOk) this.activeProvider = 'ollama';
    else if (lmstudioOk) this.activeProvider = 'lmstudio';
    
    return { ollama: ollamaOk, lmstudio: lmstudioOk };
  }
  
  /**
   * Lista todos os modelos disponíveis
   */
  async listAllModels(): Promise<LocalModel[]> {
    const models: LocalModel[] = [];
    
    const providers = await this.detectProviders();
    
    if (providers.ollama) {
      const ollamaModels = await this.ollama.listModels();
      models.push(...ollamaModels);
    }
    
    if (providers.lmstudio) {
      const lmModels = await this.lmstudio.listModels();
      models.push(...lmModels);
    }
    
    return models;
  }
  
  /**
   * Baixa modelo (Ollama)
   */
  async pullModel(
    modelName: string,
    onProgress?: (progress: number, status: string) => void
  ): Promise<void> {
    await this.ollama.pullModel(modelName, onProgress);
  }
  
  /**
   * Gera resposta
   */
  async* chat(
    model: string,
    messages: { role: string; content: string }[]
  ): AsyncGenerator<string, void, unknown> {
    if (this.activeProvider === 'ollama') {
      const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');
      yield* this.ollama.generate(model, prompt);
    } else if (this.activeProvider === 'lmstudio') {
      yield* this.lmstudio.generate(model, messages);
    }
  }
  
  /**
   * Embeddings
   */
  async embed(model: string, text: string): Promise<number[]> {
    return this.ollama.embed(model, text);
  }
}

// ===== UI Components =====

export function LocalModelCard({ model, onPull, onSelect }: {
  model: LocalModel;
  onPull?: (id: string) => void;
  onSelect?: (id: string) => void;
}) {
  const statusColors = {
    available: 'bg-green-500',
    downloading: 'bg-yellow-500',
    loading: 'bg-blue-500',
    ready: 'bg-green-500',
    error: 'bg-red-500',
  };
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <Badge className={statusColors[model.status]}>{model.status}</Badge>
          <span className="text-xs">{model.size}B params</span>
        </div>
        <CardTitle>{model.name}</CardTitle>
        <CardDescription>
          {model.contextLength} ctx • {model.quantization} • {model.gpuVRAM}MB VRAM
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex gap-2">
        {model.status === 'available' ? (
          <Button onClick={() => onPull?.(model.id)}>Download</Button>
        ) : (
          <Button variant="secondary" onClick={() => onSelect?.(model.id)}>
            Use Model
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

export function LocalModelsPanel() {
  const [models, setModels] = useState<LocalModel[]>([]);
  const [providers, setProviders] = useState({ ollama: false, lmstudio: false });
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    const manager = new LocalModelsManager();
    
    async function load() {
      setLoading(true);
      const detected = await manager.detectProviders();
      setProviders(detected);
      
      if (detected.ollama || detected.lmstudio) {
        const allModels = await manager.listAllModels();
        setModels(allModels);
      }
      setLoading(false);
    }
    
    load();
  }, []);
  
  return (
    <div className="local-models">
      <div className="providers-status flex gap-4 mb-4">
        <Badge variant={providers.ollama ? 'default' : 'outline'}>
          Ollama {providers.ollama ? '🟢' : '🔴'}
        </Badge>
        <Badge variant={providers.lmstudio ? 'default' : 'outline'}>
          LM Studio {providers.lmstudio ? '🟢' : '🔴'}
        </Badge>
      </div>
      
      {loading ? (
        <Spinner>Detecting models...</Spinner>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {models.map(model => (
            <LocalModelCard key={model.id} model={model} />
          ))}
        </div>
      )}
    </div>
  );
}

export default LocalModelsManager;