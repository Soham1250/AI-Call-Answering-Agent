from dataclasses import dataclass
from typing import Dict, Optional
from TTS.api import TTS
import torch
import hashlib
import re
from cachetools import LRUCache

@dataclass
class TTSModel:
    model_id: str
    speaker: Optional[str] = None
    language: Optional[str] = None

class TTSManager:
    def __init__(self):
        self.models: Dict[str, TTS] = {}
        self.voice_map = {
            "en-IN": TTSModel("tts_models/en/vctk/vits"),
            "hi-IN": TTSModel("tts_models/hi/cv/vits"),
            "mr-IN": TTSModel("tts_models/hi/cv/vits"),  # Fallback to Hindi for Marathi
        }
        self.cache = LRUCache(maxsize=1000)  # Cache up to 1000 audio samples
        self._load_models()

    def _load_models(self):
        """Preload all TTS models."""
        device = "cuda" if torch.cuda.is_available() else "cpu"
        for locale, model_info in self.voice_map.items():
            print(f"Loading {locale} model: {model_info.model_id}...")
            self.models[locale] = TTS(model_info.model_id, progress_bar=False).to(device)

    def _get_cache_key(self, text: str, locale: str) -> str:
        """Generate a cache key from text and locale."""
        normalized_text = self._normalize_text(text)
        return f"{locale}:{hashlib.sha256(normalized_text.encode('utf-8')).hexdigest()}"

    @staticmethod
    def _normalize_text(text: str) -> str:
        """Normalize text by collapsing whitespace and stripping."""
        return re.sub(r'\s+', ' ', text).strip()

    def synthesize_speech(self, text: str, locale: str) -> bytes:
        """Synthesize speech for the given text and locale."""
        if locale not in self.voice_map:
            raise ValueError(f"Unsupported locale: {locale}")

        # Check cache first
        cache_key = self._get_cache_key(text, locale)
        if cache_key in self.cache:
            return self.cache[cache_key]

        # Get the appropriate model
        model = self.models[locale]
        model_info = self.voice_map[locale]
        
        # Normalize text but preserve placeholders like {name}
        normalized_text = self._normalize_text(text)
        
        # Generate audio
        audio = model.tts(
            text=normalized_text,
            speaker=model_info.speaker,
            language=model_info.language,
        )

        # Convert to 16kHz mono WAV
        import numpy as np
        import soundfile as sf
        import io
        
        # Convert to 16-bit PCM WAV
        audio_int16 = (audio * 32767).astype(np.int16)
        
        # Write to in-memory WAV file
        with io.BytesIO() as wav_buffer:
            sf.write(wav_buffer, audio_int16, 22050, format='WAV', subtype='PCM_16')
            wav_data = wav_buffer.getvalue()
        
        # Cache the result
        self.cache[cache_key] = wav_data
        
        return wav_data
