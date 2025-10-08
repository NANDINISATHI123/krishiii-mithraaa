import { KnowledgeAnswer, QuestionHistory, Bookmark, Language } from '../types.ts';
import { GoogleGenAI, Type } from '@google/genai';
import { supabase } from '../lib/supabaseClient.ts';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// Per project requirements, the API key must be sourced from environment variables.
// In a no-build environment, this assumes `process.env.API_KEY` is made available
// to the browser context through external means.
// The app will gracefully fall back to mock data if the key is not available.
const API_KEY = process.env.API_KEY;

export const getKnowledgeAnswer = async (query: string, lang: Language): Promise<KnowledgeAnswer> => {
    if (!API_KEY) {
        console.warn("Gemini API key not found. Falling back to mock knowledge answer.");
        return getMockKnowledgeAnswer(query);
    }
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    const langInstruction = lang === 'te' ? 'You MUST respond only in the Telugu language.' : 'Please provide the answer in English.';
    const prompt = `
        You are an expert in organic and sustainable farming, specifically for small-scale farmers in India. 
        Analyze the following question and provide a clear, concise, and actionable answer.
        Also, provide three related questions a farmer might ask next.
        ${langInstruction}
        
        Question: "${query}"

        Respond ONLY in the structured JSON format defined by the schema.
    `;

    const schema = {
        type: Type.OBJECT,
        properties: {
            answer: { type: Type.STRING, description: "The detailed, practical answer to the user's question." },
            related_questions: {
                type: Type.ARRAY,
                description: "An array of three relevant follow-up questions.",
                items: { type: Type.STRING }
            }
        },
        required: ["answer", "related_questions"]
    };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
            },
        });

        const resultJson = JSON.parse(response.text);

        return {
            question: query,
            answer: resultJson.answer,
            likes: Math.floor(Math.random() * 20), // mock
            dislikes: Math.floor(Math.random() * 3), // mock
            related: resultJson.related_questions || [],
        };

    } catch (error: any) {
        console.error("Gemini API call for knowledge base failed:", error.message);
        // Fallback to the old method if the new one fails, for resilience
        return getMockKnowledgeAnswer(query);
    }
};


export const getMockKnowledgeAnswer = async (query: string): Promise<KnowledgeAnswer> => {
    await delay(1000);
    console.log('Answering query:', query);
    
    return {
        question: query,
        answer: "Jeevamrutham is a microbial culture that enriches the soil. To prepare it, mix 10 kg of cow dung and 10 litres of cow urine in 200 litres of water. Add 2 kg of jaggery, 2 kg of pulse flour, and a handful of soil from your farm. Stir well and let it ferment for 48 hours. It's then ready to be applied to the soil.",
        likes: 12,
        dislikes: 1,
        related: [
            "How to prepare Panchagavya?",
            "What are the benefits of organic fertilizers?",
            "Best composting methods for small farms",
        ]
    };
};

// --- History and Bookmarks ---
export const getHistory = async (userId: string): Promise<QuestionHistory[]> => {
    const { data, error } = await supabase.from('question_history').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(10);
    return error ? [] : data;
};

export const addHistory = async (userId: string, question: string): Promise<QuestionHistory | null> => {
    // Using RPC to call a SECURITY DEFINER function on the backend.
    // This is the correct way to handle writes that should be permitted by RLS policies.
    const { data, error } = await supabase.rpc('add_question_history', {
        p_user_id: userId,
        p_question: question,
    });

    if (error) {
        console.error("Error adding history:", error.message);
        throw error;
    }
    return data;
};

export const getBookmarks = async (userId: string): Promise<Bookmark[]> => {
    const { data, error } = await supabase.from('bookmarks').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    return error ? [] : data;
};

export const addBookmark = async (userId: string, question: string, answer: string): Promise<Bookmark | null> => {
    const { data, error } = await supabase.from('bookmarks').insert({ user_id: userId, question, answer }).select().single();
    if (error) {
        console.error("Error adding bookmark:", error.message);
        throw error;
    }
    return data;
};