"""
Eigent Local Models Backend (Ollama/LM Studio)
"""

import aiohttp
import asyncio
from typing import AsyncGenerator, Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from datetime import datetime

app = FastAPI(
    title="Eigent Local Models API",
    description="Backend for local model inference",
    version="1.0.0",
)

# ===== Models =====

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    temperature: Optional[float] = 0.7
    top_p: Optional[float] = 0.9
    top_k: Optional[int] = 40
    seed: Optional[int] = None
    stream: bool = True

class GenerateRequest(BaseModel):
    model: str
    prompt: str
    temperature: Optional[float] = 0.7
    stream: bool = True

class PullRequest(BaseModel):
    name: str

class EmbedRequest(BaseModel):
    model: str
    prompt: str

# ===== Ollama Client =====

class OllamaClient:
    def __init__(self, base_url: str = "http://localhost:11434"):
        self.base_url = base_url
    
    async def list_models(self) -> List[Dict[str, Any]]:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{self.base_url}/api/tags") as resp:
                if resp.status != 200:
                    return []
                data = await resp.json()
                return data.get("models", [])
    
    async def pull_model(self, name: str) -> AsyncGenerator[Dict[str, Any], None]:
        """Pull a model with progress updates"""
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/api/pull",
                json={"name": name, "stream": True}
            ) as resp:
                async for line in resp.content:
                    line = line.decode('utf-8').strip()
                    if line:
                        try:
                            yield eval(line)  # Safely parse JSON lines
                        except:
                            pass
    
    async def generate(
        self,
        model: str,
        prompt: str,
        **options
    ) -> AsyncGenerator[str, None]:
        """Generate with streaming"""
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/api/generate",
                json={"model": model, "prompt": prompt, "stream": True, **options}
            ) as resp:
                async for line in resp.content:
                    line = line.decode('utf-8').strip()
                    if line:
                        try:
                            data = eval(line)
                            if 'response' in data:
                                yield data['response']
                        except:
                            pass
    
    async def chat(
        self,
        model: str,
        messages: List[Dict[str, str]],
        **options
    ) -> AsyncGenerator[str, None]:
        """Chat with streaming"""
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/api/chat",
                json={"model": model, "messages": messages, "stream": True, **options}
            ) as resp:
                async for line in resp.content:
                    line = line.decode('utf-8').strip()
                    if line:
                        try:
                            data = eval(line)
                            if 'message' in data:
                                yield data['message'].get('content', '')
                        except:
                            pass
    
    async def embeddings(self, model: str, prompt: str) -> List[float]:
        """Generate embeddings"""
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/api/embeddings",
                json={"model": model, "prompt": prompt}
            ) as resp:
                data = await resp.json()
                return data.get('embedding', [])
    
    async def health_check(self) -> bool:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.base_url}/api/tags",
                    timeout=aiohttp.ClientTimeout(total=3)
                ) as resp:
                    return resp.status == 200
        except:
            return False

# ===== LM Studio Client =====

class LMStudioClient:
    def __init__(self, base_url: str = "http://localhost:1234/v1"):
        self.base_url = base_url
    
    async def list_models(self) -> List[Dict[str, Any]]:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{self.base_url}/models") as resp:
                if resp.status != 200:
                    return []
                data = await resp.json()
                return data.get("data", [])
    
    async def chat(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        **options
    ) -> AsyncGenerator[str, None]:
        """Chat completions with streaming"""
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/chat/completions",
                json={
                    "model": model,
                    "messages": messages,
                    "temperature": temperature,
                    "stream": True,
                    **options
                }
            ) as resp:
                async for line in resp.content:
                    line = line.decode('utf-8').strip()
                    if line.startswith('data: '):
                        data_str = line[6:]
                        if data_str == '[DONE]':
                            break
                        try:
                            data = eval(data_str)
                            content = data.get('choices', [{}])[0].get('delta', {}).get('content')
                            if content:
                                yield content
                        except:
                            pass
    
    async def health_check(self) -> bool:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.base_url}/models",
                    timeout=aiohttp.ClientTimeout(total=3)
                ) as resp:
                    return resp.status == 200
        except:
            return False

# ===== Instances =====

ollama = OllamaClient()
lmstudio = LMStudioClient()
active_provider = None

# ===== Routes =====

@app.get("/api/local/health")
async def health():
    """Check which providers are available"""
    ollama_ok = await ollama.health_check()
    lmstudio_ok = await lmstudio.health_check()
    
    return {
        "status": "healthy" if (ollama_ok or lmstudio_ok) else "no_providers",
        "providers": {
            "ollama": ollama_ok,
            "lmstudio": lmstudio_ok,
        },
        "active": active_provider,
    }

@app.get("/api/local/models")
async def list_models():
    """List all available local models"""
    models = []
    
    if await ollama.health_check():
        ollama_models = await ollama.list_models()
        for m in ollama_models:
            models.append({
                "id": m.get("name"),
                "name": m.get("name"),
                "provider": "ollama",
                "size": m.get("size", 0),
                "quantization": "q4_0",  # default
                "context_length": m.get("model_info", {}).get("context_length", 4096),
                "status": "available",
            })
    
    if await lmstudio.health_check():
        lm_models = await lmstudio.list_models()
        for m in lm_models:
            models.append({
                "id": m.get("id"),
                "name": m.get("id"),
                "provider": "lmstudio",
                "size": m.get("size", 0),
                "quantization": "q4_0",
                "context_length": m.get("context_length", 4096),
                "status": "available",
            })
    
    return models

@app.post("/api/local/pull/{model_name}")
async def pull_model(model_name: str):
    """Pull/ownload a model"""
    global active_provider
    
    if not await ollama.health_check():
        raise HTTPException(503, "Ollama not available")
    
    active_provider = "ollama"
    
    progress = []
    async for update in ollama.pull_model(model_name):
        progress.append(update)
    
    return {"status": "completed", "progress": progress}

@app.post("/api/local/chat")
async def chat(request: ChatRequest):
    """Chat with local model (streaming)"""
    global active_provider
    
    if await ollama.health_check():
        active_provider = "ollama"
        return generate_stream(
            ollama.chat(
                request.model,
                [m.dict() for m in request.messages],
                temperature=request.temperature,
            )
        )
    
    if await lmstudio.health_check():
        active_provider = "lmstudio"
        return generate_stream(
            lmstudio.chat(
                request.model,
                [m.dict() for m in request.messages],
                temperature=request.temperature,
            )
        )
    
    raise HTTPException(503, "No local providers available")

@app.post("/api/local/generate")
async def generate(request: GenerateRequest):
    """Generate text (streaming)"""
    global active_provider
    
    if await ollama.health_check():
        active_provider = "ollama"
        return generate_stream(
            ollama.generate(
                request.model,
                request.prompt,
                temperature=request.temperature,
            )
        )
    
    raise HTTPException(503, "Ollama not available")

@app.post("/api/local/embed")
async def embed(request: EmbedRequest):
    """Generate embeddings"""
    if not await ollama.health_check():
        raise HTTPException(503, "Ollama not available")
    
    embedding = await ollama.embeddings(request.model, request.prompt)
    return {"embedding": embedding}

# ===== Helper =====

async def generate_stream(generator: AsyncGenerator[str, None]):
    """Helper to convert async generator to SSE response"""
    from fastapi.responses import StreamingResponse
    
    async def _stream():
        async for chunk in generator:
            yield f"data: {chunk}\n\n"
        yield "data: [DONE]\n\n"
    
    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3001)