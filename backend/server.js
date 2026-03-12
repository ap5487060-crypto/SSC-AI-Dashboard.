require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyDQCnNqsoAsxlfpbumCpsigCbevNAt5l1A"; // Provided in prompt context
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Helper function to call Ollama (local) with a fallback to Gemini
async function generateAIResponse(prompt, systemInstruction = "") {
    let finalPrompt = systemInstruction ? `${systemInstruction}\n\n${prompt}` : prompt;
    
    // Attempt Ollama first
    try {
        const ollamaResponse = await fetch("http://localhost:11434/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama3",
                prompt: finalPrompt,
                stream: false
            }),
            signal: AbortSignal.timeout(5000) // 5s timeout for local check
        });

        if (ollamaResponse.ok) {
            const data = await ollamaResponse.json();
            return { response: data.response, source: 'Ollama' };
        }
    } catch (error) {
        console.log("Ollama unavailable or timed out. Falling back to Gemini API...");
    }

    // Fallback to Gemini
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(finalPrompt);
        const responseText = result.response.text();
        return { response: responseText, source: 'Gemini' };
    } catch (geminiError) {
        console.error("Gemini Error:", geminiError);
        throw new Error("Both local AI and Cloud AI failed.");
    }
}

// 1. AI Chat Endpoint
app.post('/ai-chat', async (req, res) => {
    try {
        const { message, weakSubject } = req.body;
        const systemInstruction = `You are an expert SSC CGL tutor helping a student prepare for the Income Tax Inspector post. Help with Quant, Reasoning, English, and General Awareness. User's weakest subject is currently ${weakSubject ? weakSubject.toUpperCase() : 'UNKNOWN'}. Provide clear explanations, practice questions, and study advice. Answer in Hinglish if appropriate.`;
        
        const result = await generateAIResponse(`User Question: ${message}`, systemInstruction);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. AI Quant Solver Endpoint
app.post('/solve-quant', async (req, res) => {
    try {
        const { problem } = req.body;
        const systemInstruction = `You are an expert Quantitative Aptitude solver for SSC CGL. Solve the given math problem step-by-step. Provide the final answer clearly and explain the concept or shortcut trick used. Format with clear markdown headings like:
### Step-by-Step Solution
### Final Answer
### Concept / Shortcut Trick`;
        
        const result = await generateAIResponse(`Problem: ${problem}`, systemInstruction);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. AI Mock Test Generator Endpoint
app.post('/generate-mock', async (req, res) => {
    try {
        // Since generating 100 questions might be too slow for a synchronous request, we'll generate a "mini" mock or just 1 question per section for demonstration.
        // Or we can request 4 questions (1 from each section)
        const systemInstruction = `You are an SSC CGL Mock Test Generator. Generate exactly 4 Multiple Choice Questions (1 from Quant, 1 from Reasoning, 1 from English, 1 from General Awareness). 
Format strictly as JSON without any markdown formatting block around it, in this format:
[
  { "subject": "Quant", "question": "...", "options": ["A", "B", "C", "D"], "correctAnswer": "A", "explanation": "..." },
  ...
]`;
        
        const result = await generateAIResponse("Generate a mini mock test.", systemInstruction);
        
        // Clean JSON from markdown block if AI adds it
        let jsonStr = result.response.replace(/```json/gi, '').replace(/```/g, '').trim();
        const testData = JSON.parse(jsonStr);
        
        res.json({ test: testData, source: result.source });
    } catch (error) {
        res.status(500).json({ error: "Failed to generate mock test. " + error.message });
    }
});

// 4. Weak Topic Analyzer Endpoint
app.post('/weak-topic', async (req, res) => {
    try {
        const { studyData, mockScores } = req.body;
        const systemInstruction = `You are an AI Study Coach for SSC CGL. Analyze the user's data:
Study Minutes: ${JSON.stringify(studyData)}
Mock Scores: ${JSON.stringify(mockScores)}

Identify the weakest subject and a specific recommended topic to focus on. Return a clean short message. Example:
Weak Subject: Quant
Recommended Topic: Algebra
Action: Practice 20 questions today.`;

        const result = await generateAIResponse("Analyze my study data and give a recommendation.", systemInstruction);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`AI Backend Server running on http://localhost:${PORT}`);
});