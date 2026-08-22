export const fetchWithRetry = async (prompt, apiKey, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7 } })
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.error?.message?.toLowerCase().includes('high demand') && i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        throw new Error(data.error?.message || 'Помилка API');
      }
      return data.candidates?.[0]?.content?.parts?.[0]?.text;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
};

export const formatAIMarkdown = (text, strongClass = "text-white font-bold", emClass = "text-blue-200/80") => {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, `<strong class="${strongClass}">$1</strong>`)
    .replace(/\*(.*?)\*/g, `<em class="${emClass}">$1</em>`)
    .replace(/\n/g, '<br/>');
};