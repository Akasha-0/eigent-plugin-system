"""
Eigent REST API - FastAPI Backend
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

app = FastAPI(
    title="Eigent API",
    description="REST API for Eigent Desktop Cowork AI Agent",
    version="1.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== Models =====

class AgentRunRequest(BaseModel):
    input: str = Field(..., min_length=1, max_length=10000)
    model: Optional[str] = "gpt-4"
    temperature: Optional[float] = Field(default=0.7, ge=0, le=2)
    maxTokens: Optional[int] = Field(default=1000, ge=1, max=4000)
    context: Optional[Dict[str, Any]] = {}
    plugins: Optional[List[str]] = []

class AgentRunResponse(BaseModel):
    output: str
    model: str
    tokens: int
    finishReason: str
    latency: float

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = ""

class Project(BaseModel):
    id: str
    name: str
    description: str
    createdAt: datetime
    updatedAt: datetime

class PluginStatus(BaseModel):
    id: str
    name: str
    version: str
    enabled: bool
    capabilities: List[str]

class WebhookCreate(BaseModel):
    url: str
    events: List[str]

# ===== In-memory storage (replace with DB in production) =====

projects_db: Dict[str, Project] = {}
plugins_db: Dict[str, PluginStatus] = {}
webhooks_db: Dict[str, Dict[str, Any]] = {}

# ===== Routes =====

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat(),
    }

# ===== Agent Routes =====

@app.post("/api/agent/run", response_model=AgentRunResponse)
async def run_agent(request: AgentRunRequest):
    """
    Executa um agent com o input fornecido.
    """
    start = datetime.utcnow()
    
    # TODO: Integrate with actual agent runtime
    # Por agora, retorna resposta simulada
    output = f"[Agent Response] Processed: {request.input[:50]}..."
    
    latency = (datetime.utcnow() - start).total_seconds() * 1000
    
    return AgentRunResponse(
        output=output,
        model=request.model,
        tokens=len(request.input.split()) * 2,  # rough estimate
        finishReason="stop",
        latency=latency,
    )

@app.post("/api/agent/stream")
async def stream_agent(request: AgentRunRequest):
    """
    Executa agent com streaming de resposta SSE.
    """
    async def event_generator():
        # Simula streaming token por token
        words = request.input.split()
        for i, word in enumerate(words[:10]):  # Limita para demo
            yield f"data: {word} \n\n"
            await asyncio.sleep(0.1)
        yield "data: [DONE]\n\n"
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/api/agent/models")
async def list_models():
    """Lista modelos disponíveis"""
    return [
        {"id": "gpt-4", "name": "GPT-4", "provider": "OpenAI", "status": "online", "contextWindow": 8192},
        {"id": "gpt-3.5-turbo", "name": "GPT-3.5 Turbo", "provider": "OpenAI", "status": "online", "contextWindow": 4096},
        {"id": "claude-3", "name": "Claude 3", "provider": "Anthropic", "status": "online", "contextWindow": 200000},
    ]

# ===== Project Routes =====

@app.get("/api/projects", response_model=List[Project])
async def list_projects():
    """Lista todos os projetos"""
    return list(projects_db.values())

@app.post("/api/projects", response_model=Project, status_code=201)
async def create_project(data: ProjectCreate):
    """Cria novo projeto"""
    import uuid
    project_id = str(uuid.uuid4())[:8]
    project = Project(
        id=project_id,
        name=data.name,
        description=data.description or "",
        createdAt=datetime.utcnow(),
        updatedAt=datetime.utcnow(),
    )
    projects_db[project_id] = project
    return project

@app.get("/api/projects/{project_id}", response_model=Project)
async def get_project(project_id: str):
    """Busca projeto por ID"""
    if project_id not in projects_db:
        raise HTTPException(status_code=404, detail="Project not found")
    return projects_db[project_id]

@app.delete("/api/projects/{project_id}", status_code=204)
async def delete_project(project_id: str):
    """Deleta projeto"""
    if project_id in projects_db:
        del projects_db[project_id]

# ===== Plugin Routes =====

@app.get("/api/plugins", response_model=List[PluginStatus])
async def list_plugins():
    """Lista plugins instalados"""
    return list(plugins_db.values())

@app.post("/api/plugins/{plugin_id}/enable")
async def enable_plugin(plugin_id: str):
    """Habilita plugin"""
    if plugin_id in plugins_db:
        plugins_db[plugin_id].enabled = True
    return {"success": True, "pluginId": plugin_id}

@app.post("/api/plugins/{plugin_id}/disable")
async def disable_plugin(plugin_id: str):
    """Desabilita plugin"""
    if plugin_id in plugins_db:
        plugins_db[plugin_id].enabled = False
    return {"success": True, "pluginId": plugin_id}

# ===== Webhook Routes =====

@app.post("/api/webhooks")
async def register_webhook(data: WebhookCreate):
    """Registra novo webhook"""
    import uuid
    webhook_id = str(uuid.uuid4())[:8]
    webhooks_db[webhook_id] = {
        "id": webhook_id,
        "url": data.url,
        "events": data.events,
        "createdAt": datetime.utcnow().isoformat(),
    }
    return {"id": webhook_id, **data.model_dump()}

@app.delete("/api/webhooks/{webhook_id}", status_code=204)
async def delete_webhook(webhook_id: str):
    """Remove webhook"""
    if webhook_id in webhooks_db:
        del webhooks_db[webhook_id]

# ===== Utility Routes =====

@app.get("/api/openapi.json")
async def get_openapi_spec():
    """Retorna OpenAPI spec"""
    return app.openapi()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)