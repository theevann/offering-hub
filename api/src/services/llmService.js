const { createLogger } = require("../utils/logger");
const log = createLogger("llm");

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ quiet: true })
}

const { PROVIDERS } = require('../config/llmProviders');
const STORAGE_PATH = process.env.STORAGE_PATH;
log.debug(`STORAGE_PATH: ${STORAGE_PATH}`);


function extractJson(content) {
    if (content.trim().startsWith('```json')) {
        const jsonStart = content.indexOf('```json') + 7;
        const jsonEnd = content.lastIndexOf('```');
        content = content.substring(jsonStart, jsonEnd);
    }
    return content;
}

// TODO: Is this function necessary?q
function normalizeImages(options = {}) {
    if (Array.isArray(options.images)) {
        return options.images
            .map((image) => {
                if (typeof image === 'string') {
                    return { url: image };
                }
                if (image?.url) {
                    return {
                        url: image.url,
                        mimeType: image.mimeType || null
                    };
                }
                return null;
            })
            .filter(Boolean);
    }

    if (typeof options.imageUrl === 'string') {
        return [{ url: options.imageUrl, mimeType: options.imageMimeType || null }];
    }

    return [];
}

async function image2base64(image) {
    const fs = require('fs').promises;
    const path = require('path');

    // show image info
    log.debug(`Converting image to base64: ${image.url}, mimeType: ${image.mimeType}`);

    // Read the file
    const imagePath = path.join(STORAGE_PATH, image.url);
    const imageBuffer = await fs.readFile(imagePath);

    // Convert to base64
    const base64 = imageBuffer.toString('base64');

    // Determine MIME type
    let mimeType = image.mimeType;
    if (!mimeType) {
        const ext = path.extname(image.url).toLowerCase();
        const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.avif': 'image/avif',
            '.bmp': 'image/bmp'
        };
        mimeType = mimeTypes[ext] || 'image/jpeg';
    }

    // Return data URL
    return `data:${mimeType};base64,${base64}`;
}

async function buildMessages(systemPrompt, userPrompt, images = []) {
    if (images.length === 0) {
        return [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];
    }

    const imageContent = await Promise.all(
        images.map(async (image) => ({
            type: 'image_url',
            image_url: {
                url: await image2base64(image)
            }
        }))
    );

    return [
        { role: 'system', content: systemPrompt },
        {
            role: 'user',
            content: [
                { type: 'text', text: userPrompt },
                ...imageContent
            ]
        }
    ];
}

async function callLLM(
    systemPrompt,
    userPrompt,
    { models, images = [], asJson = true }
) {
    if (!models.length) {
        throw new Error("No LLM models configured");
    }

    // Prepare images once. A missing local file shouldn't trigger fallbacks.
    const messages = await buildMessages(systemPrompt, userPrompt, images);

    const failures = [];

    for (const model of models) {
        try {
            return {
                ...(await callModel(model, messages, { asJson })),
                parsingModel: model
            };
        } catch (error) {
            log.warn(`Model ${model} failed: ${error.message}`);
            failures.push(`${model}: ${error.message}`);
        }
    }

    throw new Error(`All models failed:\n${failures.join("\n")}`);
}


/**
 * Generic LLM caller that routes to the appropriate provider
 * @param {string} provider - The provider to use
 * @param {Array} messages - The messages - ready to be sent to the model
 * @param {Object} options - Additional options for the request - used for images
 * @returns {Promise<Object>} - Parsed JSON object
 */
// Note: TODO: Use responses api
async function callModel(provider, messages, { asJson = true }) {
    const providerConfig = PROVIDERS[provider];
    if (!providerConfig) {
        throw new Error(`Unknown LLM provider: ${provider}`);
    }

    const apiKey = process.env[providerConfig.envKey];
    if (!apiKey) {
        throw new Error(`${providerConfig.envKey} not set`);
    }

    const requestBody = {
        model: providerConfig.model,
        messages: messages,
        temperature: providerConfig.temperature ?? 1,
    };

    const maxTokensField = providerConfig.maxTokensField || 'max_tokens';
    requestBody[maxTokensField] = providerConfig.maxTokens ?? 5000;
    if (providerConfig.reasoning) {
        requestBody.reasoning = providerConfig.reasoning;
    }

    log.info(`Calling ${provider} with model: ${providerConfig.model}`);

    const response = await fetch(providerConfig.url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        log.error("Provider error:", response.status, errorText);
        throw new Error(`${provider} API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    if (data.error) {
        throw new Error(
            `${provider}: ${data.error.code ?? response.status} — ` +
            data.error.message
        );
    }
    log.debug(`Response metadata from ${provider}:`, data);

    const content = data.choices[0]?.message?.content;
    if (!content) {
        throw new Error(`No content in ${provider} response`);
    }
    log.debug(`Response content from ${provider}:`, content);

    return asJson ? JSON.parse(extractJson(content)) : content;
}

function readModelList(name) {
    return (process.env[name] || "")
        .split(",")
        .map(model => model.trim())
        .filter(Boolean);
}

module.exports = {
    readModelList,
    callLLM
};