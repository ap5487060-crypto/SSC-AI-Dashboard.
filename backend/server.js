require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
// Using the provided Gemini API key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyDQCnNqsoAsxlfpbumCpsigCbevNAt5l1A";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

/**
 * CORE AI LOGIC
 * Tries local Ollama first, then falls back to Gemini Cloud.
 */
async function generateAIResponse(prompt, systemInstruction = "") {
    const finalPrompt = systemInstruction ? `${systemInstruction}\n\n${prompt}` : prompt;
    
    // 1. Attempt Local Ollama (Only works if user is running it on their local machine and port is forwarded/available)
    // Note: On Render, this will fail and trigger Gemini fallback.
    try {
        const ollamaResponse = await fetch("http://localhost:11434/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama3",
                prompt: finalPrompt,
                stream: false
            }),
            signal: AbortSignal.timeout(3000) 
        });

        if (ollamaResponse.ok) {
            const data = await ollamaResponse.ok ? await ollamaResponse.json() : null;
            if (data && data.response) return { response: data.response, source: 'Ollama (Local)' };
        }
    } catch (error) {
        console.log("Local AI unavailable. Routing to Cloud AI...");
    }

    // 2. Fallback to Google Gemini
    try {
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
        });
        const result = await model.generateContent(finalPrompt);
        return { response: result.response.text(), source: 'Gemini (Cloud)' };
    } catch (err) {
        console.error("AI Error:", err);
        return { response: "I'm currently recalibrating my brain. Please try again in a few seconds!", source: 'System' };
    }
}

// --- API ENDPOINTS ---

// AI Tutor Chat
app.post('/ai-chat', async (req, res) => {
    const { message, weakSubject } = req.body;
    const system = `You are a Pro SSC CGL Tutor for Mission 2028. Target: Income Tax Inspector. Help with Quant, Reasoning, English, and GK. User weakest subject: ${weakSubject || 'General'}. Answer clearly in Hinglish.`;
    const result = await generateAIResponse(message, system);
    res.json(result);
});

// AI Quant Solver
app.post('/solve-quant', async (req, res) => {
    const { problem } = req.body;
    const system = "You are a Quantitative Aptitude Expert. Solve the problem step-by-step with SSC shortcut tricks. Provide the final answer clearly.";
    const result = await generateAIResponse(problem, system);
    res.json(result);
});

// AI Mock Test Generator
app.post('/generate-mock', async (req, res) => {
    const system = `Generate 4 Multiple Choice Questions for SSC CGL. 1 from each: Quant, Reasoning, English, GK. 
    Format STRICTLY as a JSON array like: 
    [{"subject":"Quant", "question":"...", "options":["A","B","C","D"], "correctAnswer":"A", "explanation":"..."}]`;
    try {
        const result = await generateAIResponse("Generate test", system);
        let cleaned = result.response.replace(/```json/gi, '').replace(/```/g, '').trim();
        res.json({ test: JSON.parse(cleaned), source: result.source });
    } catch (e) {
        res.status(500).json({ error: "Failed to generate mock test." });
    }
});

// Weak Topic Analyzer
app.post('/weak-topic', async (req, res) => {
    const { studyData } = req.body;
    const system = `Analyze this study data (minutes): ${JSON.stringify(studyData)}. 
    Suggest exactly 3 lines:
    1. Weakest Subject
    2. Recommended Topic
    3. Action Plan`;
    const result = await generateAIResponse("Analyze data", system);
    res.json(result);
});

app.listen(PORT, () => console.log(`Backend live on port ${PORT}`));