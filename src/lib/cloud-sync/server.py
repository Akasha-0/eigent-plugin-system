"""
Eigent Cloud Sync Backend
"""

from fastapi import FastAPI, HTTPException, Header, Form
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum
import uuid
import json
import time

app = FastAPI(
    title="Eigent Sync API",
    description="Cloud sync service for Eigent",
    version="1.0.0",
)

# ===== Models =====

class SyncItemType(str, Enum):
    SETTINGS = "settings"
    MEMORY = "memory"
    AGENTS = "agents"
    PROJECTS = "projects"
    PREFERENCES = "preferences"

class SyncItem(BaseModel):
    id: str
    type: SyncItemType
    key: str
    value: Any
    device_id: str
    updated_at: datetime
    version: int

class CreateSyncItem(BaseModel):
    type: SyncItemType
    key: str
    value: Any

class Resolution(str, Enum):
    LOCAL = "local"
    REMOTE = "remote"
    MERGE = "merge"

# ===== In-Memory Storage =====

# Device storage
devices_db: Dict[str, Dict[str, Any]] = {}

# Sync items
sync_items_db: Dict[str, SyncItem] = {}

# Pending changes
pending_db: Dict[str, List[Dict[str, Any]]] = {}

# ===== Routes =====

@app.get("/api/sync/status")
async def get_sync_status(x_device_id: str = Header(None)):
    """Get sync status"""
    if not x_device_id:
        return {
            "connected": False,
            "last_sync": None,
            "pending": 0,
            "conflicts": 0,
            "devices": [],
        }
    
    device_items = [v for v in sync_items_db.values() if v.device_id == x_device_id]
    pending = len(pending_db.get(x_device_id, []))
    
    return {
        "connected": True,
        "last_sync": datetime.utcnow().isoformat(),
        "pending": pending,
        "conflicts": 0,
        "devices": [
            {"id": d["id"], "name": d["name"], "last_seen": d["last_seen"]}
            for d in devices_db.values()
        ],
    }

@app.post("/api/sync/items")
async def create_sync_item(item: CreateSyncItem, x_device_id: str = Header(None)):
    """Sync an item"""
    if not x_device_id:
        raise HTTPException(401, "Device not registered")
    
    # Check for existing
    existing_key = f"{item.type.value}:{item.key}"
    existing = None
    
    for stored in sync_items_db.values():
        if stored.type == item.type and stored.key == item.key:
            existing = stored
            break
    
    new_item = SyncItem(
        id=str(uuid.uuid4()),
        type=item.type,
        key=item.key,
        value=item.value,
        device_id=x_device_id,
        updated_at=datetime.utcnow(),
        version=(existing.version + 1) if existing else 1,
    )
    
    sync_items_db[new_item.id] = new_item
    
    return new_item

@app.get("/api/sync/items")
async def list_sync_items(
    type: Optional[SyncItemType] = None,
    key: Optional[str] = None,
    x_device_id: str = Header(None)
):
    """List sync items"""
    results = []
    
    for item in sync_items_db.values():
        if type and item.type != type:
            continue
        if key and item.key != key:
            continue
        results.append(item)
    
    return sorted(results, key=lambda x: x.updated_at, reverse=True)

@app.get("/api/sync/items/{item_id}")
async def get_sync_item(item_id: str):
    """Get specific item"""
    if item_id not in sync_items_db:
        raise HTTPException(404, "Item not found")
    return sync_items_db[item_id]

@app.delete("/api/sync/items/{item_id}")
async def delete_sync_item(item_id: str, x_device_id: str = Header(None)):
    """Delete sync item"""
    if item_id in sync_items_db:
        del sync_items_db[item_id]
    return {"success": True}

@app.get("/api/sync/devices")
async def list_devices():
    """List registered devices"""
    return list(devices_db.values())

@app.post("/api/sync/devices")
async def register_device(
    name: str,
    x_device_id: str = Header(None)
):
    """Register new device"""
    if not x_device_id:
        raise HTTPException(401, "Device ID required")
    
    devices_db[x_device_id] = {
        "id": x_device_id,
        "name": name,
        "last_seen": datetime.utcnow().isoformat(),
    }
    
    return {"success": True, "device_id": x_device_id}

@app.post("/api/sync/conflicts/{item_id}/resolve")
async def resolve_conflict(
    item_id: str,
    resolution: Resolution,
    x_device_id: str = Header(None)
):
    """Resolve sync conflict"""
    if item_id not in sync_items_db:
        raise HTTPException(404, "Item not found")
    
    # In production, implement proper conflict resolution
    return {"success": True}

@app.get("/api/sync/export")
async def export_data(x_device_id: str = Header(None)):
    """Export all user data"""
    device_items = [
        {"type": v.type.value, "key": v.key, "value": v.value}
        for v in sync_items_db.values()
    ]
    
    return json.dumps({"data": device_items, "exported": datetime.utcnow().isoformat()})

@app.post("/api/sync/import")
async def import_data(
    data: Dict[str, Any],
    x_device_id: str = Header(None)
):
    """Import user data"""
    imported = 0
    
    for item_data in data.get("data", []):
        item = SyncItem(
            id=str(uuid.uuid4()),
            type=SyncItemType(item_data["type"]),
            key=item_data["key"],
            value=item_data["value"],
            device_id=x_device_id or "imported",
            updated_at=datetime.utcnow(),
            version=1,
        )
        sync_items_db[item.id] = item
        imported += 1
    
    return {"success": True, "imported": imported}

@app.get("/api/sync/health")
async def sync_health():
    """Health check"""
    return {
        "status": "healthy",
        "items_count": len(sync_items_db),
        "devices_count": len(devices_db),
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
