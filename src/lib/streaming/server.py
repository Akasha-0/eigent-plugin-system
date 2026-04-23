"""
Eigent Streaming Responses Backend
"""

import asyncio
import json
from typing import AsyncGenerator, Callable, Optional
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from datetime import datetime

app = FastAPI(
    title="Eigent Streaming API",
    description="Streaming responses for Eigent agents",
    version="1.0.0",
)

# ===== Models =====

class StreamRequest(BaseModel):
    input: str = Field(..., min_length=1, max_length=10000)
    model: Optional[str] = "gpt-4"
    temperature: Optional[float] = Field(0.7, ge=0, le=2)
    maxTokens: Optional[int] = Field(1000, ge=1, max=4000)
    stream: Optional[bool] = True

# ===== SSE Utilities =====

async def sse_generator(
    handler: Callable[[], AsyncGenerator[str, None, None]]
) -> AsyncGenerator[str, None, None]:
    """Wrapper para gerar eventos SSE"""
    try:
        async for chunk in handler():
            data = json.dumps({"content": chunk, "timestamp": datetime.utcnow().isoformat()})
            yield f"data: {data}\n\n"
        
        # Done event
        yield "data: {\"done\": true}\n\n"
    except Exception as e:
        error = json.dumps({"error": str(e)})
        yield f"data: {error}\n\n"

def sse_response(generator: AsyncGenerator[str, None, None]) -> StreamingResponse:
    """Criaresponse SSE"""
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )

# ===== Streaming Handlers =====

async def simulate_streaming_response(prompt: str) -> AsyncGenerator[str, None, None]:
    """
    Simula streaming response (substitua com chamada real ao LLM).
    Para demo - quebra o texto em palavras.
    """
    words = prompt.split()
    
    for i, word in enumerate(words):
        # Simula delay de processamento
        await asyncio.sleep(0.05)
        
        # Adiciona pontuação ocasional
        content = word
        if i < len(words) - 1:
            content += " "
        if (i + 1) % 10 == 0:
            content += ". "
        elif (i + 1) % 5 == 0:
            content += ", "
        
        yield content
    
    # Yield completa response no final
    yield "\n\n[Completed]"

async def openai_streaming(prompt: str, api_key: str, model: str = "gpt-4") -> AsyncGenerator[str, None, None]:
    """Streaming com OpenAI"""
    import aiohttp
    
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    data = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": True,
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=data, headers=headers) as response:
            if response.status != 200:
                error = await response.text()
                yield f"data: {json.dumps({'error': error})}\n\n"
                return
            
            async for line in response.content:
                line = line.decode('utf-8')
                
                if not line.startswith('data: '):
                    continue
                
                data_str = line[6:]
                
                if data_str == '[DONE]':
                    break
                
                try:
                    json_data = json.loads(data_str)
                    content = json_data.get('choices', [{}])[0].get('delta', {}).get('content', '')
                    if content:
                        yield content
                except json.JSONDecodeError:
                    continue

async def anthropic_streaming(prompt: str, api_key: str, model: str = "claude-3-sonnet-20240229") -> AsyncGenerator[str, None, None]:
    """Streaming com Anthropic"""
    import aiohttp
    
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    data = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": True,
        "max_tokens": 1024,
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=data, headers=headers) as response:
            if response.status != 200:
                error = await response.text()
                yield f"data: {json.dumps({'error': error})}\n\n"
                return
            
            async for line in response.content:
                line = line.decode('utf-8')
                
                if not line.startswith('data: '):
                    continue
                
                try:
                    # Anthropic SSE format
                    if 'event' in line:
                        json_data = json.loads(line[6:])
                        if json_data.get('type') == 'content_block_delta':
                            delta = json_data.get('delta', {})
                            if delta.get('type') == 'text_delta':
                                yield delta.get('text', '')
                except json.JSONDecodeError:
                    continue

# ===== Routes =====

@app.post("/api/agent/stream")
async def stream_agent(request: StreamRequest):
    """
    Endpoint principal de streaming.
    Retorna Server-Sent Events (SSE).
    """
    
    async def generate():
        start_time = datetime.utcnow()
        full_content = ""
        
        try:
            # Simula processamento (substitua com seu agent real)
            async for chunk in simulate_streaming_response(request.input):
                full_content += chunk
                
                # Envia chunk
                data = json.dumps({
                    "content": chunk,
                    "index": len(full_content.split()),
                    "timestamp": datetime.utcnow().isoformat(),
                })
                yield f"data: {data}\n\n"
                
                # Delay entre chunks (simula digitação humana)
                await asyncio.sleep(0.03)
            
            # Completion
            latency = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            yield f"data: {json.dumps({{'done': true, 'latency': latency, 'tokens': len(full_content.split())})}}\n\n"
            
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

@app.post("/api/agent/stream/openai")
async def stream_openai(request: StreamRequest):
    """Streaming com OpenAI (requer API key)"""
    
    api_key = request.headers.get("X-OpenAI-API-Key")
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing X-OpenAI-API-Key header")
    
    async def generate():
        async for chunk in openai_streaming(request.input, api_key, request.model):
            yield f"data: {json.dumps({'content': chunk})}\n\n"
        yield "data: {\"done\": true}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")

@app.post("/api/agent/stream/anthropic")
async def stream_anthropic(request: StreamRequest):
    """Streaming com Anthropic (requer API key)"""
    
    api_key = request.headers.get("X-Anthropic-API-Key")
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing X-Anthropic-API-Key header")
    
    async def generate():
        async for chunk in anthropic_streaming(request.input, api_key, request.model):
            yield f"data: {json.dumps({'content': chunk})}\n\n"
        yield "data: {\"done\": true}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")

# ===== Health =====

@app.get("/api/stream/health")
async def stream_health():
    return {"status": "streaming", "supported": True}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)