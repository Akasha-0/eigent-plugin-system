/**
 * Eigent Vision & OCR System
 * 
 * Suporte a análise de imagens e OCR.
 * Permite upload de imagens para análise por agentes.
 * 
 * @version 1.0.0
 */

import { z } from 'zod';
import { useState, useRef, useCallback } from 'react';

// ===== Types =====

export const ImageInputSchema = z.object({
  type: z.enum(['url', 'file', 'base64']),
  source: z.string(), // URL, File object, ou base64 string
});

export const VisionModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.enum(['openai', 'anthropic', 'google', 'local']),
  supports: z.object({
    ocr: z.boolean().default(false),
    analysis: z.boolean().default(true),
    document: z.boolean().default(false),
  }),
  maxImageSize: z.number().default(20), // MB
  supportedFormats: z.array(z.string()).default(['jpg', 'png', 'gif', 'webp']),
});

export type ImageInput = z.infer<typeof ImageInputSchema>;
export type VisionModel = z.infer<typeof VisionModelSchema>;

export const AnalysisResultSchema = z.object({
  id: z.string(),
  description: z.string(),
  text: z.string().optional(), // OCR result
  objects: z.array(z.object({
    label: z.string(),
    confidence: z.number(),
    boundingBox: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }),
  })).default([]),
  labels: z.array(z.string()).default([]),
  faces: z.array(z.object({
    age: z.number().optional(),
    gender: z.string().optional(),
    emotions: z.record(z.number()).optional(),
  })).default([]),
  colors: z.array(z.object({
    hex: z.string(),
    percentage: z.number(),
  })).default([]),
  language: z.string().optional(),
  unsafe: z.boolean().default(false),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

// ===== Vision Providers =====

class VisionAPI {
  /**
   * Analisa imagem com OCR
   */
  static async analyze(
    image: ImageInput,
    options?: {
      model?: string;
      includeOCR?: boolean;
      includeObjects?: boolean;
      includeLabels?: boolean;
      language?: string;
    }
  ): Promise<AnalysisResult> {
    const response = await fetch('/api/vision/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, options }),
    });
    
    if (!response.ok) {
      throw new Error(`Vision analysis failed: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  /**
   * Extrai texto de imagem (OCR)
   */
  static async extractText(
    image: ImageInput,
    language: string = 'auto'
  ): Promise<string> {
    const result = await this.analyze(image, {
      includeOCR: true,
      language,
    });
    
    return result.text || '';
  }
  
  /**
   * Descreve imagem
   */
  static async describe(image: ImageInput): Promise<string> {
    const result = await this.analyze(image);
    return result.description;
  }
}

// ===== File Upload Component =====

export function ImageUploader({
  onUpload,
  maxSize = 20,
  acceptedFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'],
}: {
  onUpload: (input: ImageInput) => void;
  maxSize?: number;
  acceptedFormats?: string[];
}) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const handleFile = useCallback(async (file: File) => {
    // Validate size
    if (file.size > maxSize * 1024 * 1024) {
      alert(`File too large. Max size: ${maxSize}MB`);
      return;
    }
    
    // Validate format
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!acceptedFormats.includes(ext || '')) {
      alert(`Invalid format. Accepted: ${acceptedFormats.join(', ')}`);
      return;
    }
    
    setUploading(true);
    
    try {
      // Convert to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      onUpload({
        type: 'base64',
        source: base64,
      });
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  }, [maxSize, acceptedFormats, onUpload]);
  
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);
  
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);
  
  return (
    <div
      className={`uploader ${dragOver ? 'drag-over' : ''} ${uploading ? 'uploading' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={acceptedFormats.map(f => `.${f}`).join(',')}
        onChange={handleInputChange}
        hidden
      />
      
      {uploading ? (
        <Spinner>Uploading...</Spinner>
      ) : (
        <>
          <UploadIcon className="w-12 h-12 mx-auto mb-4" />
          <p>Drag & drop image here or click to browse</p>
          <p className="text-sm text-muted-foreground mt-2">
            Max {maxSize}MB • {acceptedFormats.join(', ')}
          </p>
        </>
      )}
    </div>
  );
}

// ===== Vision Chat Component =====

export function VisionChat() {
  const [messages, setMessages] = useState<Array<{
    role: 'user' | 'assistant';
    content: string;
    image?: ImageInput;
  }>>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [image, setImage] = useState<ImageInput | null>(null);
  
  const handleImageUpload = useCallback((input: ImageInput) => {
    setImage(input);
  }, []);
  
  const handleAnalyze = useCallback(async () => {
    if (!image) return;
    
    setAnalyzing(true);
    
    try {
      const result = await VisionAPI.analyze(image, {
        includeOCR: true,
        includeObjects: true,
        includeLabels: true,
      });
      
      setMessages(prev => [
        ...prev,
        {
          role: 'user',
          content: '[Image uploaded]',
          image,
        },
        {
          role: 'assistant',
          content: result.description || result.text || 'Analysis complete',
        },
      ]);
      
      setImage(null);
    } catch (err) {
      console.error('Analysis failed:', err);
      alert('Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }, [image]);
  
  return (
    <div className="vision-chat">
      {/* Messages */}
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            {msg.image && (
              <img src={msg.image.source} alt="Uploaded" className="message-image" />
            )}
            <div className="message-content">{msg.content}</div>
          </div>
        ))}
      </div>
      
      {/* Upload */}
      {image && (
        <div className="preview">
          <img 
            src={image.source} 
            alt="Preview" 
            className="preview-image"
          />
          <div className="preview-actions">
            <Button onClick={handleAnalyze} disabled={analyzing}>
              {analyzing ? <Spinner /> : 'Analyze'}
            </Button>
            <Button variant="ghost" onClick={() => setImage(null)}>
              Remove
            </Button>
          </div>
        </div>
      )}
      
      {/* Uploader */}
      {!image && (
        <ImageUploader onUpload={handleImageUpload} />
      )}
    </div>
  );
}

// ===== OCR Panel Component =====

export function OCRPanel() {
  const [image, setImage] = useState<ImageInput | null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState('auto');
  
  const handleExtract = useCallback(async () => {
    if (!image) return;
    
    setLoading(true);
    
    try {
      const extracted = await VisionAPI.extractText(image, language);
      setText(extracted);
    } catch (err) {
      console.error('OCR failed:', err);
    } finally {
      setLoading(false);
    }
  }, [image, language]);
  
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
  }, [text]);
  
  return (
    <div className="ocr-panel">
      <div className="ocr-input">
        <ImageUploader onUpload={setImage} />
        
        {image && (
          <div className="mt-4">
            <select 
              value={language} 
              onChange={e => setLanguage(e.target.value)}
              className="mb-2"
            >
              <option value="auto">Auto-detect</option>
              <option value="en">English</option>
              <option value="pt">Portuguese</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="zh">Chinese</option>
              <option value="ja">Japanese</option>
            </select>
            
            <Button onClick={handleExtract} disabled={loading}>
              {loading ? <Spinner /> : 'Extract Text'}
            </Button>
          </div>
        )}
      </div>
      
      {text && (
        <div className="ocr-output">
          <div className="flex justify-between items-center mb-2">
            <h3>Extracted Text</h3>
            <Button variant="ghost" size="sm" onClick={handleCopy}>
              Copy
            </Button>
          </div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            className="w-full h-64 p-3 border rounded"
            placeholder="Extracted text will appear here..."
          />
        </div>
      )}
    </div>
  );
}

export default VisionAPI;