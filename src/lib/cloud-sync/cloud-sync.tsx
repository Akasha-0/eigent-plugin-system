/**
 * Eigent Cloud Sync System
 * 
 * Sincroniza dados entre dispositivos.
 * Backup na nuvem, settings, memory, e cross-device.
 * 
 * @version 1.0.0
 */

import { z } from 'zod';
import { useState, useEffect, useCallback } from 'react';

// ===== Types =====

export const SyncItemSchema = z.object({
  id: z.string(),
  type: z.enum(['settings', 'memory', 'agents', 'projects', 'preferences']),
  key: z.string(),
  value: z.any(),
  deviceId: z.string(),
  updatedAt: z.string().datetime(),
  version: z.number(),
});

export const SyncConflictSchema = z.object({
  itemId: z.string(),
  local: z.object({
    value: z.any(),
    updatedAt: z.string(),
  }),
  remote: z.object({
    value: z.any(),
    updatedAt: z.string(),
  }),
});

export const SyncStatusSchema = z.object({
  connected: z.boolean(),
  lastSync: z.string().datetime().nullable(),
  pending: z.number(),
  conflicts: z.number(),
  devices: z.array(z.object({
    id: z.string(),
    name: z.string(),
    lastSeen: z.string().datetime(),
  })),
});

export type SyncItem = z.infer<typeof SyncItemSchema>;
export type SyncConflict = z.infer<typeof SyncConflictSchema>;
export type SyncStatus = z.infer<typeof SyncStatusSchema>;

// ===== Sync Service =====

class CloudSync {
  private baseUrl: string;
  private deviceId: string;
  
  constructor(baseUrl: string = 'https://sync.eigent.ai') {
    this.baseUrl = baseUrl;
    this.deviceId = this.getOrCreateDeviceId();
  }
  
  private getOrCreateDeviceId(): string {
    let id = localStorage.getItem('eigent_device_id');
    if (!id) {
      id = `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('eigent_device_id', id);
    }
    return id;
  }
  
  /**
   * Conecta e obtém status
   */
  async connect(): Promise<SyncStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sync/status`, {
        headers: { 'X-Device-ID': this.deviceId },
      });
      return response.json();
    } catch {
      // Fallback to local
      return {
        connected: false,
        lastSync: null,
        pending: 0,
        conflicts: 0,
        devices: [{ id: this.deviceId, name: 'This Device', lastSeen: new Date().toISOString() }],
      };
    }
  }
  
  /**
   * Sincroniza item
   */
  async sync(item: Omit<SyncItem, 'id' | 'deviceId' | 'updatedAt' | 'version'>): Promise<SyncItem> {
    const response = await fetch(`${this.baseUrl}/api/sync/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': this.deviceId,
      },
      body: JSON.stringify(item),
    });
    
    return response.json();
  }
  
  /**
   * Busca item por key
   */
  async get(type: SyncItem['type'], key: string): Promise<SyncItem | null> {
    const response = await fetch(
      `${this.baseUrl}/api/sync/items?type=${type}&key=${key}`,
      { headers: { 'X-Device-ID': this.deviceId } }
    );
    
    const items = await response.json();
    return items[0] || null;
  }
  
  /**
   * Lista itens por type
   */
  async list(type: SyncItem['type']): Promise<SyncItem[]> {
    const response = await fetch(
      `${this.baseUrl}/api/sync/items?type=${type}`,
      { headers: { 'X-Device-ID': this.deviceId } }
    );
    return response.json();
  }
  
  /**
   * Resolve conflito
   */
  async resolveConflict(
    itemId: string,
    resolution: 'local' | 'remote' | 'merge'
  ): Promise<void> {
    await fetch(`${this.baseUrl}/api/sync/conflicts/${itemId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': this.deviceId,
      },
      body: JSON.stringify({ resolution }),
    });
  }
  
  /**
   * Export dados
   */
  async exportData(): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/api/sync/export`, {
      headers: { 'X-Device-ID': this.deviceId },
    });
    
    return new Blob([await response.text()], { type: 'application/json' });
  }
  
  /**
   * Import dados
   */
  async importData(data: object): Promise<void> {
    await fetch(`${this.baseUrl}/api/sync/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': this.deviceId,
      },
      body: JSON.stringify(data),
    });
  }
  
  /**
   * Register device
   */
  async registerDevice(name: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/sync/devices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': this.deviceId,
      },
      body: JSON.stringify({ name }),
    });
  }
}

// ===== Local Storage Mirror =====

class LocalSyncStorage {
  private prefix = 'eigent_sync_';
  
  /**
   * Salva localmente
   */
  setItem<T>(key: string, value: T): void {
    localStorage.setItem(
      `${this.prefix}${key}`,
      JSON.stringify({
        value,
        updatedAt: new Date().toISOString(),
        version: 1,
      })
    );
  }
  
  /**
   * Obtém localmente
   */
  getItem<T>(key: string): T | null {
    const data = localStorage.getItem(`${this.prefix}${key}`);
    if (!data) return null;
    
    const parsed = JSON.parse(data);
    return parsed.value as T;
  }
  
  /**
   * Remove localmente
   */
  removeItem(key: string): void {
    localStorage.removeItem(`${this.prefix}${key}`);
  }
  
  /**
   * Lista todas as chaves
   */
  keys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        keys.push(key.slice(this.prefix.length));
      }
    }
    return keys;
  }
}

// ===== Sync Settings Component =====

export function SyncSettings() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [deviceName, setDeviceName] = useState('My Device');
  
  const sync = new CloudSync();
  const localStorage = new LocalSyncStorage();
  
  useEffect(() => {
    async function load() {
      const s = await sync.connect();
      setStatus(s);
      setLoading(false);
    }
    load();
  }, []);
  
  const handleSyncNow = useCallback(async () => {
    setSyncing(true);
    await sync.sync({ type: 'settings', key: 'all', value: localStorage.keys() });
    const s = await sync.connect();
    setStatus(s);
    setSyncing(false);
  }, []);
  
  const handleExport = useCallback(async () => {
    const blob = await sync.exportData();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eigent-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  }, []);
  
  const handleImport = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      const text = await file.text();
      await sync.importData(JSON.parse(text));
    };
    input.click();
  }, []);
  
  if (loading) return <Spinner>Loading sync status...</Spinner>;
  
  return (
    <div className="sync-settings">
      <h2 className="text-2xl font-bold mb-4">Cloud Sync</h2>
      
      {/* Status */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Sync Status</CardTitle>
          <CardDescription>
            {status?.connected ? 'Connected to cloud' : 'Offline mode'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-2xl font-bold">{status?.pending || 0}</div>
              <div className="text-sm">Pending changes</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{status?.devices.length || 1}</div>
              <div className="text-sm">Connected devices</div>
            </div>
          </div>
          
          {status?.lastSync && (
            <p className="text-sm text-muted-foreground mt-2">
              Last sync: {new Date(status.lastSync).toLocaleString()}
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={handleSyncNow} disabled={syncing}>
            {syncing ? <Spinner /> : 'Sync Now'}
          </Button>
        </CardFooter>
      </Card>
      
      {/* Devices */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>My Devices</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {status?.devices.map(device => (
              <div key={device.id} className="flex items-center justify-between p-2 border rounded">
                <div>
                  <div className="font-medium">{device.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Last seen: {new Date(device.lastSeen).toLocaleString()}
                  </div>
                </div>
                <Badge>{device.id === status?.devices?.[0]?.id ? 'This' : 'Other'}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* Backup */}
      <Card>
        <CardHeader>
          <CardTitle>Backup & Restore</CardTitle>
        </CardHeader>
        <CardFooter className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            Export Backup
          </Button>
          <Button variant="outline" onClick={handleImport}>
            Import Backup
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default CloudSync;