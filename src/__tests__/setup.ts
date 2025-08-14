// Set up test environment variables
process.env.TTS_PROVIDER = 'coqui_http';
process.env.TTS_HTTP_URL = 'http://localhost:8000';

// Mock environment variables for Azure TTS tests
process.env.TTS_KEY = 'test-key';
process.env.AZURE_REGION = 'test-region';
