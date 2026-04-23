/**
 * Eigent Streaming Responses
 * 
 * Sistema de streaming em tempo real para respostas de agents.
 * Melhora UX com feedback instantâneo enquanto o agent gera conteúdo.
 * 
 * @version 1.0.0
 */

import { useEffect, useRef, useState, useCallback } from 'react';

// ===== Types =====

export interface StreamChunk {
  id: string;
  content: string;
  delta: string;
  index: number;
  done: boolean;
}

export interface StreamConfig {
  /** Tempo entre chunks em ms */
  chunkDelay?: number;
  
  /** Mostrar typing indicator */
  showTyping?: boolean;
  
  /** Animação de cursor */
  cursorAnimation?: boolean;
  
  /** Auto-scroll para bottom */
  autoScroll?: boolean;
  
  /** Max tokens para streaming (0 = unlimited) */
  maxTokens?: number;
  
  /** Callback quando completo */
  onComplete?: (fullContent: string, metadata: StreamMetadata) => void;
  
  /** Callback por chunk */
  onChunk?: (chunk: StreamChunk) => void;
}

export interface StreamMetadata {
  model: string;
  tokens: number;
  latency: number; // ms
  finishReason: 'stop' | 'length' | 'content_filter';
}

// ===== Streaming Hook =====

export function useStreamingAgent() {
  const [output, setOutput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [metadata, setMetadata] = useState<StreamMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const abortController = useRef<AbortController | null>(null);
  
  /**
   * Executa agent com streaming
   */
  const runStreaming = useCallback(async (
    input: string,
    config?: StreamConfig
  ) => {
    // Reset state
    setOutput('');
    setIsStreaming(true);
    setError(null);
    setMetadata(null);
    
    const startTime = Date.now();
    let chunkIndex = 0;
    
    // Cria AbortController para cancellation
    abortController.current = new AbortController();
    
    try {
      const response = await fetch('/api/agent/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
        signal: abortController.current.signal,
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Streaming not supported');
      }
      
      const decoder = new TextDecoder();
      
      // Lê chunks
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        const chunk = decoder.decode(value);
        chunkIndex++;
        
        // Processa chunk
        setOutput(prev => {
          const newContent = prev + chunk;
          config?.onChunk?.({
            id: `chunk-${chunkIndex}`,
            content: newContent,
            delta: chunk,
            index: chunkIndex,
            done: false,
          });
          return newContent;
        });
        
        // Delay entre chunks (simula digitação)
        if (config?.chunkDelay && config.chunkDelay > 0) {
          await new Promise(r => setTimeout(r, config.chunkDelay));
        }
      }
      
      // Completo
      const latency = Date.now() - startTime;
      
      setMetadata({
        model: 'gpt-4',
        tokens: output.split(' ').length,
        latency,
        finishReason: 'stop',
      });
      
      config?.onComplete?.(output, metadata!);
      
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setIsStreaming(false);
      abortController.current = null;
    }
  }, [output]);
  
  /**
   * Cancela streaming
   */
  const cancel = useCallback(() => {
    abortController.current?.abort();
    setIsStreaming(false);
  }, []);
  
  /**
   * Limpa output
   */
  const clear = useCallback(() => {
    setOutput('');
    setMetadata(null);
    setError(null);
  }, []);
  
  return {
    output,
    isStreaming,
    metadata,
    error,
    runStreaming,
    cancel,
    clear,
  };
}

// ===== Streaming Chat Component =====

export function StreamingChat({ 
  config,
  onSend,
}: {
  config?: StreamConfig;
  onSend?: (input: string) => Promise<void>;
}) {
  const [input, setInput] = useState('');
  const { output, isStreaming, metadata, error, runStreaming, cancel, clear } = useStreamingAgent();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll quando novo conteúdo chega
  useEffect(() => {
    if (config?.autoScroll !== false && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output, config?.autoScroll]);
  
  // Cursor piscante
  const [showCursor, setShowCursor] = useState(true);
  useEffect(() => {
    if (!config?.cursorAnimation) return;
    
    const interval = setInterval(() => {
      setShowCursor(v => !v);
    }, 530);
    
    return () => clearInterval(interval);
  }, [config?.cursorAnimation]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    
    await onSend?.(input);
  };
  
  return (
    <div className="streaming-chat">
      {/* Output Area */}
      <div ref={scrollRef} className="output-area">
        {output ? (
          <div className="prose">
            {output}
            {isStreaming && (
              <span className={`cursor ${showCursor ? 'visible' : 'hidden'}`}>
                ▊
              </span>
            )}
          </div>
        ) : (
          <div className="text-muted-foreground">
            Start a conversation...
          </div>
        )}
        
        {/* Typing indicator */}
        {isStreaming && config?.showTyping && (
          <div className="typing-indicator">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        )}
        
        {/* Error */}
        {error && (
          <div className="error text-red-500">
            Error: {error}
          </div>
        )}
      </div>
      
      {/* Metadata */}
      {metadata && !isStreaming && (
        <div className="metadata text-xs text-muted-foreground">
          {metadata.tokens} tokens • {metadata.latency}ms • {metadata.finishReason}
        </div>
      )}
      
      {/* Input */}
      <form onSubmit={handleSubmit} className="input-area">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={isStreaming}
        />
        <button type="submit" disabled={isStreaming || !input.trim()}>
          {isStreaming ? 'Streaming...' : 'Send'}
        </button>
        {isStreaming && (
          <button type="button" onClick={cancel}>
            Cancel
          </button>
        )}
      </form>
    </div>
  );
}

// ===== Optimized Chat with Typewriter Effect =====

export function TypewriterChat({ 
  initialText = '',
  speed = 30,
  onComplete,
}: {
  initialText?: string;
  speed?: number;
  onComplete?: (text: string) => void;
}) {
  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const indexRef = useRef(0);
  
  useEffect(() => {
    if (!initialText || isComplete) return;
    
    const interval = setInterval(() => {
      if (indexRef.current < initialText.length) {
        setDisplayedText(initialText.slice(0, indexRef.current + 1));
        indexRef.current++;
      } else {
        setIsComplete(true);
        onComplete?.(initialText);
        clearInterval(interval);
      }
    }, speed);
    
    return () => clearInterval(interval);
  }, [initialText, speed, isComplete, onComplete]);
  
  return (
    <div className="typewriter-chat">
      <span>{displayedText}</span>
      {!isComplete && <span className="cursor animate-pulse">▊</span>}
    </div>
  );
}

// ===== Streaming API (Server-Side) =====

export const StreamingAPI = {
  /**
   * Cria streaming response para FastAPI
   */
  createServerStreamHandler(
    handler: (input: string) => AsyncGenerator<string, void, unknown>
  ) {
    return async function* (input: string) {
      let fullContent = '';
      
      for await (const chunk of handler(input)) {
        fullContent += chunk;
        yield `data: ${JSON.stringify({ content: chunk })}\n\n`;
      }
      
      yield `data: ${JSON.stringify({ done: true, content: fullContent })}\n\n`;
    };
  },
  
  /**
   * Middleware para SSE
   */
  sseHeaders: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  },
};

// ===== Example: OpenAI Streaming =====

export async function* openAIStreaming(
  apiKey: string,
  model: string,
  prompt: string
): AsyncGenerator<string, void, unknown> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`OpenAI error: ${response.statusText}`);
  }
  
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  
  if (!reader) return;
  
  let done = false;
  while (!done) {
    const { done: readerDone, value } = await reader.read();
    if (readerDone) {
      done = true;
      break;
    }
    
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(Boolean);
    
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      
      const data = line.slice(6);
      if (data === '[DONE]') {
        done = true;
        break;
      }
      
      try {
        const json = JSON.parse(data);
        const content = json.choices?.[0]?.delta?.content;
        if (content) {
          yield content;
        }
      } catch {
        // Skip invalid JSON
      }
    }
  }
}

export default useStreamingAgent;