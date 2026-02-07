import OpenAI from 'openai'
import type { ChatMessage, ChatResult, ProviderCallConfig, ToolCall } from './types'

type FullProviderConfig = ProviderCallConfig & { provider: string }

// SHELVED: Moved here to remove from active codebase per user request.

export async function callOpenAIImage(
    config: ProviderCallConfig,
    prompt: string
): Promise<ChatResult> {
    const openai = new OpenAI({
        apiKey: config.apiKey,
        ...(config.baseUrl && { baseURL: config.baseUrl })
    })

    try {
        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: prompt,
            n: 1,
            size: "1024x1024",
            response_format: "b64_json"
        })

        if (!response.data || response.data.length === 0) {
            throw new Error("No image data returned from OpenAI")
        }

        const image = response.data[0]
        const imageUrl = image.b64_json
            ? `data:image/png;base64,${image.b64_json}`
            : image.url

        if (!imageUrl) throw new Error("No image URL returned")

        return {
            content: `Here is the generated image based on your request: "${prompt}"`,
            // Return standard tokens as 0 since DALL-E uses different billing
            tokensInput: 0,
            tokensOutput: 0,
            stopReason: 'end_turn',
            // Return image as legacy image array for UI compatibility
            // The Message component will render this nicely
            images: [imageUrl]
        }
    } catch (error: any) {
        console.error("OpenAI Image Generation Error:", error)
        throw new Error(`Image generation failed: ${error.message}`)
    }
}

export async function generateImage(
    config: FullProviderConfig,
    prompt: string
): Promise<ChatResult> {
    switch (config.provider) {
        case 'openai':
            return callOpenAIImage(config, prompt)

        case 'google':
            // TODO: Implement Google Imagen integration
            // Fallback to text for now
            return {
                content: "Image generation with Google (Imagen) is not yet configured. Please switch to OpenAI for image generation.",
                tokensInput: 0,
                tokensOutput: 0
            }

        default:
            return {
                content: `Image generation is not supported for provider '${config.provider}'. Please use OpenAI.`,
                tokensInput: 0,
                tokensOutput: 0
            }
    }
}
