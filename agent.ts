import { BaseMessage } from "@langchain/core/messages"
import { Annotation } from "@langchain/langgraph"
import { tool } from "@langchain/core/tools"
import { MongoClient } from "mongodb"
import { ToolNode } from "@langchain/langgraph/prebuilt"
import { ChatGoogleGenerativeAI } from "@langchain/google-genai"
import { z } from "zod"
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb"
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai"
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages"
import "dotenv/config"


async function retryWithBackOff<T>(
    fn: () => Promise<T>,
    maxRetries = 3
): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn()
        } catch (error: any) {
            if (error.status === 429 && attempt < maxRetries) {
                const delay = Math.min(1000 * Math.pow(2, attempt))
                console.log(`Rate limit hit. Retrying in ${delay / 1000} seconds...`)
                await new Promise(resolve => setTimeout(resolve, delay))
                continue
            }
            throw error
        }
    }
    throw new Error('Max retries exceeded')
}

export async function callAgent(client: MongoClient, query: string, thread_id: string) {
    try {
        const dbName = "inventory_database"
        const db = client.db(dbName)
        const collection = db.collection('items')
        const GraphState = Annotation.Root({
            messages: Annotation<BaseMessage[]>({
                reducer: (x, y) => x.concat(y)
            })
        })
        const itemLookupTool = tool(async ({ query, n = 10 }) => {
            try {
                console.log("Item lookup tool called with query:", query)
                const totalCount = await collection.countDocuments()
                console.log(`Total documents in collection: ${totalCount}`)
                if (totalCount === 0) {
                    console.log("Collection is empty")
                    return JSON.stringify({
                        error: "No items found in inventory",
                        message: "The inventory database appears to be empty",
                        count: 0
                    })
                }
                // Get sample documents for debugging purposes
                const sampleDocs = await collection.find({}).limit(3).toArray()
                console.log("Sample documents:", sampleDocs)
                const dbConfig = {
                    collection,
                    indexName: 'vector_index',
                    textKey: "embedding_text",
                    embeddingKey: "embedding",
                }
                const vectorStore = new MongoDBAtlasVectorSearch(
                    new GoogleGenerativeAIEmbeddings({
                        apiKey: process.env.GOOGLE_API_KEY,
                        model: "text-embedding-004",
                    }),
                    dbConfig
                )
                console.log("Performing vector search...")
                const result = await vectorStore.similaritySearchWithScore(query, n)
                console.log(`Vector search returned ${result.length} results`)
                if (result.length === 0) {
                    console.log("Vector search returned no results, trying text search...")
                    const textResults = await collection.find({
                        $or: [
                            { item_name: { $regex: query, $options: 'i' } },
                            { item_description: { $regex: query, $options: 'i' } },
                            { categories: { $regex: query, $options: 'i' } },
                            { embedding_text: { $regex: query, $options: 'i' } },
                        ]
                    }).limit(n).toArray()
                    console.log(`Text search returned ${textResults.length} results`)
                    return JSON.stringify({
                        results: textResults,
                        searchType: "vector",
                        query,
                        count: result.length
                    })
                }
            } catch (error: any) {
                console.error("Error in item lookup:", error)
                console.error("Error details:", {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                })
                // Return error information as JSON string
                return JSON.stringify({
                    error: "Failed to search inventory",
                    details: error.message,
                    query: query
                })
            }
        },
            {
                name: "item_lookup",
                description: "Gathers furniture item details from the Inventory database",
                schema: z.object({
                    query: z.string().describe("The search query"),
                    n: z.number().optional().default(10)
                        .describe("Number of results to return"),
                }),
            }
        )
        const tools = [itemLookupTool]
        const toolNode = new ToolNode<typeof GraphState.State>(tools)
        const model = new ChatGoogleGenerativeAI(
            {
                model: "gemini-1.5-flash",         //  Use Gemini 1.5 Flash model
                temperature: 0,                    // Deterministic responses (no randomness)
                maxRetries: 0,                     // Disable built-in retries (we handle our own)
                apiKey: process.env.GOOGLE_API_KEY,
            }
        ).bindTools(tools)
        function shouldContinue(state: typeof GraphState.State) {
            const messages = state.messages
            const lastMessage = messages[messages.length - 1] as AIMessage
        }
    } catch (error) {

    }
}