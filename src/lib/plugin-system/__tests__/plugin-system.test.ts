import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Sample test for PluginManifest schema
const PluginManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().optional(),
  author: z.string().optional(),
  capabilities: z.array(z.string()).default(['agent']),
  permissions: z.array(z.string()).default([]),
});

describe('Plugin System', () => {
  describe('PluginManifestSchema', () => {
    it('should validate a valid plugin manifest', () => {
      const manifest = {
        id: 'my-plugin',
        name: 'My Plugin',
        version: '1.0.0',
        description: 'A test plugin',
        author: 'Test Author',
        capabilities: ['agent', 'ui'],
        permissions: ['network'],
      };

      expect(() => PluginManifestSchema.parse(manifest)).not.toThrow();
    });

    it('should reject invalid version format', () => {
      const manifest = {
        id: 'my-plugin',
        name: 'My Plugin',
        version: 'invalid',
      };

      expect(() => PluginManifestSchema.parse(manifest)).toThrow();
    });

    it('should have defaults for optional fields', () => {
      const manifest = {
        id: 'minimal-plugin',
        name: 'Minimal Plugin',
        version: '1.0.0',
      };

      const result = PluginManifestSchema.parse(manifest);
      expect(result.capabilities).toEqual(['agent']);
      expect(result.permissions).toEqual([]);
    });
  });

  describe('Basic utilities', () => {
    it('should handle string utilities', () => {
      const pluginId = 'my-awesome-plugin';
      const slugified = pluginId.toLowerCase().replace(/\s+/g, '-');
      expect(slugified).toBe('my-awesome-plugin');
    });

    it('should validate semantic versioning', () => {
      const validVersions = ['1.0.0', '1.2.3', '0.0.1', '10.20.30'];
      const invalidVersions = ['1.0', 'v1.0.0', '1.0.0.0', 'latest'];

      validVersions.forEach((v) => {
        expect(/^\d+\.\d+\.\d+$/.test(v)).toBe(true);
      });

      invalidVersions.forEach((v) => {
        expect(/^\d+\.\d+\.\d+$/.test(v)).toBe(false);
      });
    });
  });
});
