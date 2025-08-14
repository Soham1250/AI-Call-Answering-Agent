from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import time
import os
from models import TTSManager

app = FastAPI(
    title="Coqui TTS Service",
    description="Local TTS service for AI Call Agent",
    version="0.1.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize TTS manager
@app.on_event("startup")
async def startup_event():
    app.state.tts = TTSManager()

class TTSParams(BaseModel):
    text: str
    locale: str = "en-IN"

@app.post("/synth")
async def synthesize_speech(params: TTSParams):
    """Synthesize speech from text."""
    if not params.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    
    if len(params.text) > 200:
        raise HTTPException(status_code=400, detail="Text too long (max 200 characters)")
    
    if params.locale not in ["en-IN", "hi-IN", "mr-IN"]:
        raise HTTPException(status_code=400, detail="Unsupported locale")
    
    try:
        start_time = time.time()
        audio_data = app.state.tts.synthesize_speech(params.text, params.locale)
        process_time = (time.time() - start_time) * 1000
        
        return Response(
            content=audio_data,
            media_type="audio/wav",
            headers={
                "X-Processing-Time-MS": f"{process_time:.2f}",
                "X-Cache-Hit": "true" if process_time < 100 else "false"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"ok": True, "status": "healthy"}

@app.get("/")
async def root():
    """Root endpoint with service information."""
    return {
        "service": "Coqui TTS Service",
        "status": "running",
        "supported_locales": ["en-IN", "hi-IN", "mr-IN"],
        "note": "For Marathi (mr-IN), the service falls back to Hindi (hi-IN) model"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
