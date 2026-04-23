"""
Eigent Vision & OCR Backend
"""

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import base64
import io
from PIL import Image
import pytesseract
from datetime import datetime
import uuid

app = FastAPI(
    title="Eigent Vision API",
    description="Vision and OCR capabilities",
    version="1.0.0",
)

# ===== Models =====

class VisionRequest(BaseModel):
    type: str  # url, file, base64
    source: str
    options: Optional[Dict[str, Any]] = {}

class VisionResponse(BaseModel):
    id: str
    description: str
    text: Optional[str] = None
    objects: List[Dict[str, Any]] = []
    labels: List[str] = []
    faces: List[Dict[str, Any]] = []
    colors: List[Dict[str, Any]] = []
    language: Optional[str] = None
    unsafe: bool = False

# ===== Image Processing =====

def process_image_base64(base64_str: str) -> Image.Image:
    """Converte base64 para PIL Image"""
    # Remove data URL prefix if present
    if ',' in base64_str:
        base64_str = base64_str.split(',')[1]
    
    img_data = base64.b64decode(base64_str)
    return Image.open(io.BytesIO(img_data))

def get_dominant_colors(image: Image.Image, n: int = 5) -> List[Dict[str, Any]]:
    """Extrai cores dominantes"""
    # Simplificado - em produção use colorthief
    img = image.resize((100, 100))
    colors = img.getcolors(10000)
    
    if not colors:
        return []
    
    sorted_colors = sorted(colors, key=lambda x: x[0], reverse=True)
    
    return [
        {
            "hex": f"#{r:#02x}{g:#02x}{b:#02x}",
            "percentage": count / (100 * 100) * 100
        }
        for count, (r, g, b, a) in sorted_colors[:n]
        if a > 128  # Ignore transparent
    ]

def estimate_language(text: str) -> str:
    """Detecta idioma simples"""
    # Portuguese common words
    pt_words = {'de', 'que', 'e', 'do', 'da', 'em', 'um', 'para', 'com', 'não', 'uma', 'os', 'no', 'se', 'na', 'por', 'mais', 'as', 'dos', 'como', 'mas', 'foi', 'ao', 'ele', 'das', 'à', 'seu', 'sua', 'ou'}
    
    words = set(text.lower().split())
    pt_count = len(words & pt_words)
    
    if pt_count > len(words) * 0.1:
        return "pt"
    
    return "en"

# ===== OCR with Tesseract =====

def perform_ocr(image: Image.Image, language: str = 'eng') -> str:
    """Executa OCR com Tesseract"""
    try:
        # Map language codes
        lang_map = {
            'auto': 'eng',
            'pt': 'por',
            'en': 'eng',
            'es': 'spa',
            'fr': 'fra',
            'de': 'deu',
            'zh': 'chi_sim',
            'ja': 'jpn',
        }
        
        lang = lang_map.get(language, 'eng')
        
        # Run OCR
        text = pytesseract.image_to_string(image, lang=lang)
        return text.strip()
    except Exception as e:
        print(f"OCR Error: {e}")
        return ""

# ===== Mock AI Vision (replace with real API) =====

async def analyze_with_ai(image: Image.Image, options: Dict[str, Any]) -> VisionResponse:
    """
    Analisa imagem com AI.
    Em produção, integre com OpenAI Vision, Claude Vision, ou Google Vision.
    """
    
    # Get image info
    width, height = image.size
    
    # OCR if requested
    text = ""
    if options.get('includeOCR', True):
        text = perform_ocr(image, options.get('language', 'auto'))
    
    # Detect language
    language = estimate_language(text) if text else None
    
    # Get colors
    colors = get_dominant_colors(image)
    
    # Mock description (em produção, chame API de visão)
    description = "Image analysis complete."
    if text:
        description = f"Image contains text ({len(text)} characters). {description}"
    
    # Mock labels (em produção, use classifier real)
    labels = ["document", "text"] if text else ["image"]
    
    return VisionResponse(
        id=str(uuid.uuid4()),
        description=description,
        text=text or None,
        objects=[],
        labels=labels,
        faces=[],
        colors=colors,
        language=language,
        unsafe=False,
    )

# ===== Routes =====

@app.get("/api/vision/models")
async def list_models():
    """Lista modelos de visão disponíveis"""
    return [
        {
            "id": "tesseract",
            "name": "Tesseract OCR",
            "provider": "local",
            "supports": {
                "ocr": True,
                "analysis": False,
                "document": True,
            },
            "maxImageSize": 20,
            "supportedFormats": ["jpg", "png", "gif", "webp", "bmp"],
        },
        {
            "id": "gpt-4o",
            "name": "GPT-4o",
            "provider": "openai",
            "supports": {
                "ocr": True,
                "analysis": True,
                "document": True,
            },
            "maxImageSize": 20,
            "supportedFormats": ["jpg", "png", "gif", "webp"],
        },
        {
            "id": "claude-3",
            "name": "Claude 3 Vision",
            "provider": "anthropic",
            "supports": {
                "ocr": True,
                "analysis": True,
                "document": True,
            },
            "maxImageSize": 10,
            "supportedFormats": ["jpg", "png", "gif", "webp"],
        },
    ]

@app.post("/api/vision/analyze")
async def analyze_image(request: VisionRequest):
    """Analisa imagem"""
    
    try:
        # Load image based on type
        if request.type == 'base64':
            image = process_image_base64(request.source)
        elif request.type == 'url':
            # Download from URL
            import requests
            response = requests.get(request.source)
            image = Image.open(io.BytesIO(response.content))
        else:
            raise HTTPException(400, "Invalid image type")
        
        # Analyze
        result = await analyze_with_ai(image, request.options or {})
        
        return result
        
    except Exception as e:
        raise HTTPException(500, f"Analysis failed: {str(e)}")

@app.post("/api/vision/ocr")
async def extract_text(
    file: UploadFile = File(...),
    language: str = Form('auto')
):
    """Extrai texto de imagem (OCR)"""
    
    try:
        # Read image
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        
        # Convert to RGB if needed
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # OCR
        text = perform_ocr(image, language)
        
        return {
            "text": text,
            "language": estimate_language(text) if text else None,
            "confidence": 0.95,  # Mock
        }
        
    except Exception as e:
        raise HTTPException(500, f"OCR failed: {str(e)}")

@app.post("/api/vision/describe")
async def describe_image(request: VisionRequest):
    """Descreve imagem"""
    
    try:
        if request.type == 'base64':
            image = process_image_base64(request.source)
        else:
            raise HTTPException(400, "Only base64 supported for now")
        
        # Get basic description
        colors = get_dominant_colors(image)
        
        description = f"Image ({image.size[0]}x{image.size[1]})"
        
        if colors:
            dominant = colors[0]
            description += f" with {dominant['hex']} as dominant color"
        
        return {
            "description": description,
            "colors": colors,
            "size": image.size,
        }
        
    except Exception as e:
        raise HTTPException(500, f"Description failed: {str(e)}")

@app.post("/api/vision/batch")
async def batch_analyze(files: List[UploadFile] = File(...)):
    """Analisa múltiplas imagens"""
    
    results = []
    
    for file in files:
        try:
            contents = await file.read()
            image = Image.open(io.BytesIO(contents))
            
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            text = perform_ocr(image, 'auto')
            
            results.append({
                "filename": file.filename,
                "success": True,
                "text_length": len(text),
                "text": text[:100] + "..." if len(text) > 100 else text,
            })
        except Exception as e:
            results.append({
                "filename": file.filename,
                "success": False,
                "error": str(e),
            })
    
    return {"results": results}

@app.get("/api/vision/health")
async def vision_health():
    """Health check"""
    return {
        "status": "healthy",
        "ocr_available": True,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)