# Coqui TTS Service

A FastAPI microservice for local text-to-speech synthesis using Coqui TTS.

## Features

- Supports English (en-IN), Hindi (hi-IN), and Marathi (mr-IN)
- Low-latency synthesis with in-memory caching
- Simple REST API
- Containerized with Docker
- Health check endpoint

## Prerequisites

- Python 3.8+
- pip
- FFmpeg
- (Optional) Docker

## Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/ai-call-agent.git
   cd ai-call-agent/tts-service
   ```

2. **Create and activate a virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the service**
   ```bash
   uvicorn app:app --reload
   ```

   The service will be available at `http://localhost:8000`

## API Endpoints

### Synthesize Speech

```http
POST /synth
Content-Type: application/json

{
  "text": "नमस्ते",
  "locale": "hi-IN"
}
```

### Health Check

```http
GET /health
```

### Service Information

```http
GET /
```

## Running with Docker

1. **Build the Docker image**
   ```bash
   docker build -t coqui-tts-service .
   ```

2. **Run the container**
   ```bash
   docker run -p 8000:8000 coqui-tts-service
   ```

## Deployment to Render

1. **Create a new Web Service** on Render
2. Connect your GitHub repository
3. Use the following settings:
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app:app --host 0.0.0.0 --port $PORT`
   - **Environment Variables**:
     - `PORT`: 10000 (or your preferred port)

## Notes

- The first request may take longer as it loads the models
- Marathi (mr-IN) falls back to Hindi (hi-IN) voice
- Audio is returned as 16kHz mono WAV
- Responses are cached in memory (LRU cache with 1000 entries)

## License

MIT
