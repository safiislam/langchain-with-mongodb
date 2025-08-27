import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from '@langchain/google-genai'
// import { client } from '.'
import "dotenv/config"
import { z } from 'zod'
import { StructuredOutputParser } from '@langchain/core/output_parsers'

import { MongoDBAtlasVectorSearch } from '@langchain/mongodb'
import { MongoClient, ServerApiVersion } from 'mongodb'
// const uri = "mongodb+srv://safi:tK5qBnf1UdPiAM3g@cluster0.yrhbvyy.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const uri = 'mongodb+srv://safi:tK5qBnf1UdPiAM3g@cluster0.qle2k13.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0'
const client = new MongoClient(uri)

const llm = new ChatGoogleGenerativeAI({
    model: "gemini-1.5-flash",  // Use Gemini 1.5 Flash model
    temperature: 0.7,               // Set creativity level (0.7 = moderately creative)
    apiKey: process.env.GOOGLE_API_KEY,
})

const itemSchema = z.object({
    item_id: z.string(),                    // Unique identifier for the item
    item_name: z.string(),                  // Name of the furniture item
    item_description: z.string(),           // Detailed description of the item
    brand: z.string(),                      // Brand/manufacturer name
    manufacturer_address: z.object({        // Nested object for manufacturer location
        street: z.string(),                   // Street address
        city: z.string(),                     // City name
        state: z.string(),                    // State/province
        postal_code: z.string(),              // ZIP/postal code
        country: z.string(),                  // Country name
    }),
    prices: z.object({                      // Nested object for pricing information
        full_price: z.number(),               // Regular price
        sale_price: z.number(),               // Discounted price
    }),
    categories: z.array(z.string()),        // Array of category tags
    user_reviews: z.array(                  // Array of customer reviews
        z.object({
            review_date: z.string(),            // Date of review
            rating: z.number(),                 // Numerical rating (1-5)
            comment: z.string(),                // Review text comment
        })
    ),
    notes: z.string(),
})

type Item = z.infer<typeof itemSchema>


const parser = StructuredOutputParser.fromZodSchema(z.array(itemSchema) as any)

async function setupDatabaseAndCollection(): Promise<void> {
    console.log("Setting up database and collection...")
    const db = client.db('inventory_database')
    const collection = await db.listCollections({ name: "items" }).toArray()
    if (collection.length === 0) {
        await db.createCollection('items')
        console.log("Created 'items' collection in 'inventory_database' database")
    }
    else {
        console.log("'items' collection already exists in 'inventory_database' database")
    }
}
async function createVectorSearchIndex(): Promise<void> {
    try {
        const db = client.db('inventory_database')
        const collection = db.collection('items')
        await collection.dropIndexes()
        const vectorSearchIdx = {
            name: "vector_index",
            type: "vectorSearch",
            definition: {
                "fields": [
                    {
                        "type": "vector",
                        "path": "embedding",
                        "numDimensions": 768,
                        "similarity": "cosine"
                    }
                ]
            }
        }
        console.log("Creating vector search index...")
        await collection.createSearchIndex(vectorSearchIdx);
        console.log("Successfully created vector search index");
    }
    catch (error) {
        console.error('Failed to create vector search index:', error);
    }
}

async function generateSyntheticData(): Promise<Item[]> {
    const prompt = `You are a helpful assistant that generates furniture store item data. Generate 10 furniture store items. Each record should include the following fields: item_id, item_name, item_description, brand, manufacturer_address, prices, categories, user_reviews, notes. Ensure variety in the data and realistic values.
  ${parser.getFormatInstructions()}`
    console.log("Generating synthetic data...")
    const response = await llm.invoke(prompt)
    return parser.parse(response.content as any) as Promise<Item[]>;
}
async function createItemSummary(item: Item): Promise<string> {
    return new Promise((resolve) => {
        const manufacturerDetails = `Made in ${item.manufacturer_address.country}`
        const categories = item.categories.join(", ")
        const userReviews = item.user_reviews.map(review => `Rated ${review.rating} on ${review.review_date}: ${review.comment}`).join(' ')
        const basicInfo = `${item.item_name} ${item.item_description} from the brand ${item.brand}`
        // Format pricing information
        const price = `At full price it costs: ${item.prices.full_price} USD, On sale it costs: ${item.prices.sale_price} USD`
        const notes = item.notes
        const summary = `${basicInfo}. Manufacturer: ${manufacturerDetails}. Categories: ${categories}. Reviews: ${userReviews}. Price: ${price}. Notes: ${notes}`

        resolve(summary)
    })
}

async function seedDatabase(): Promise<void> {
    try {
        await client.connect()
        await client.db("admin").command({ ping: 1 })
        console.log("You successfully connected to MongoDB!")
        await setupDatabaseAndCollection()

        await createVectorSearchIndex()
        const db = client.db("inventory_database")
        const collection = db.collection("items")
        await collection.deleteMany({})
        console.log("Cleared existing data from items collection")

        const syntheticData = await generateSyntheticData()

        const recordsWithSummaries = await Promise.all(
            syntheticData.map(async (record) => ({
                pageContent: await createItemSummary(record),
                metadata: { ...record }
            }))
        )
        for (const record of recordsWithSummaries) {
            await MongoDBAtlasVectorSearch.fromDocuments(
                [record],
                new GoogleGenerativeAIEmbeddings({            // Google embedding model
                    apiKey: process.env.GOOGLE_API_KEY,         // Google API key
                    modelName: "text-embedding-004",            // Google's standard embedding model (768 dimensions)
                }),
                {
                    collection,                // MongoDB collection reference
                    indexName: "vector_index", // Name of vector search index
                    textKey: "embedding_text", // Field name for searchable text
                    embeddingKey: "embedding", // Field name for vector embeddings
                }
            )
            console.log("Successfully processed & saved record:", record.metadata.item_id)
        }
        console.log("Database seeding completed")
    } catch (error) {
        console.error("Error seeding database:", error)
    } finally {
        // Always close database connection when finished (cleanup)
        await client.close()
    }
}
seedDatabase().catch(console.error)