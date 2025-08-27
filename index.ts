import express, { Express, Request, Response } from "express";
import cors from "cors";
import { MongoClient, ServerApiVersion } from 'mongodb'
const app: Express = express();

app.use(express.json())
app.use(cors())

const uri = "mongodb+srv://safi:tK5qBnf1UdPiAM3g@cluster0.yrhbvyy.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});
async function startServer() {
    try {
        await client.connect();
        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
        app.get('/', async (req: Request, res: Response) => {
            res.send('This is Chat bot')
        })

        app.post('/chat', async (req: Request, res: Response) => {
            const initialMessage = req.body.message
            const threadId = Date.now().toString()
            try {
                const response = "await callAgent(client, initialMessage, threadId)"
                res.json(response)
            } catch (error) {
                res.status(500).send({
                    success: false,
                    message: "Something went Wrong ",
                    error
                })
            }
        })
        app.post('/chat/:threadId', async (req: Request, res: Response) => {
            const initialMessage = req.body.message
            const threadId = req.params.threadId
            try {
                const response = "await callAgent(client, initialMessage, threadId)"
                res.json(response)
            } catch (error) {
                res.status(500).send({
                    success: false,
                    message: "Something went Wrong ",
                    error
                })
            }
        })
        const PORT = process.env.PORT || 8000
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`)
        })


    } catch (error) {
        // Handle any errors during server startup (especially MongoDB connection)
        console.error('Error connecting to MongoDB:', error)
        // Exit the process with error code 1 (indicates failure)
        process.exit(1)
    }
}

startServer()