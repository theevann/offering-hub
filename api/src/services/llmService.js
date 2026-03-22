if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}

const PROVIDERS = {
    deepseek: {
        url: 'https://api.deepseek.com/v1/chat/completions',
        model: 'deepseek-chat',
        envKey: 'DEEPSEEK_API_KEY',
        maxTokensField: 'max_tokens',
        maxTokens: 1024,
        temperature: 0.1
    },
    minimax: {
        url: 'https://api.minimaxi.chat/v1/text/chatcompletion_v2',
        model: 'MiniMax-M2.5',
        envKey: 'MINIMAX_API_KEY',
        maxTokensField: 'max_tokens',
        maxTokens: 1024,
        temperature: 0.1
    },
    gpt_oss_120b: {
        url: 'https://api.cerebras.ai/v1/chat/completions',
        model: 'gpt-oss-120b',
        envKey: 'CEREBRAS_API_KEY',
        maxTokensField: 'max_completion_tokens',
        maxTokens: 1024,
        temperature: 0.1
    },
    qwen_3: {
        url: 'https://api.cerebras.ai/v1/chat/completions',
        model: 'qwen-3-235b-a22b-instruct-2507',
        envKey: 'CEREBRAS_API_KEY',
        maxTokensField: 'max_completion_tokens',
        maxTokens: 1024,
        temperature: 0.1
    },
    llama_31_8b: {
        url: 'https://api.cerebras.ai/v1/chat/completions',
        model: 'llama3.1-8b',
        envKey: 'CEREBRAS_API_KEY',
        maxTokensField: 'max_completion_tokens',
        maxTokens: 1024,
        temperature: 0.1
    }
};


function extractJson(content) {
    if (content.trim().startsWith('```json')) {
        const jsonStart = content.indexOf('```json') + 7;
        const jsonEnd = content.lastIndexOf('```');
        content = content.substring(jsonStart, jsonEnd);
    }
    return content;
}


/**
 * Generic LLM caller that routes to the appropriate provider
 * @param {string} systemPrompt - The system prompt
 * @param {string} userPrompt - The user prompt
 * @param {string} provider - The provider to use ('deepseek', 'minimax', or 'cerebras')
 * @returns {Promise<Object>} - Parsed JSON object
 */
async function callLLM(systemPrompt, userPrompt, provider = 'deepseek', asJson = true) {
    const providerConfig = PROVIDERS[provider.toLowerCase()];

    if (!providerConfig) {
        throw new Error(`Unknown LLM provider: ${provider}`);
    }

    const apiKey = process.env[providerConfig.envKey];

    if (!apiKey) {
        throw new Error(`${providerConfig.envKey} not set`);
    }

    const requestBody = {
        model: providerConfig.model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        temperature: providerConfig.temperature ?? 0.1,
    };
    const maxTokensField = providerConfig.maxTokensField || 'max_tokens';
    requestBody[maxTokensField] = providerConfig.maxTokens ?? 500;

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
        throw new Error(`${provider} API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
        throw new Error(`No content in ${provider} response`);
    }
    console.log(`Raw response from ${provider}:`, content);

    return asJson ? JSON.parse(extractJson(content)) : content;
}

module.exports = {
    callLLM
};
