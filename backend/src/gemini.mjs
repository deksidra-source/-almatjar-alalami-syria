const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

export function geminiConfigured() {
  return Boolean(GEMINI_API_KEY);
}

export async function askGemini({ system, prompt, imageDataUrl }) {
  if (!GEMINI_API_KEY) {
    const error = new Error('Gemini is not configured on the server');
    error.status = 503;
    throw error;
  }

  const parts = [{ text: prompt }];
  if (imageDataUrl) {
    const match = imageDataUrl.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
    if (!match) {
      const error = new Error('imageDataUrl must be a base64 data URL');
      error.status = 400;
      throw error;
    }
    parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      system_instruction: system ? { parts: [{ text: system }] } : undefined,
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 700 },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    const error = new Error(`Gemini request failed: ${details.slice(0, 300)}`);
    error.status = response.status >= 500 ? 502 : 400;
    throw error;
  }

  const payload = await response.json();
  return payload.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim() || '';
}
