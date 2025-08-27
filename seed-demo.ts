import { StructuredOutputParser } from '@langchain/core/output_parsers'
import { z } from 'zod'

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
console.log(parser)