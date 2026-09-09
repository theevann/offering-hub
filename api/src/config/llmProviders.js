const PROVIDERS = {
    deepseek: {
        url: 'https://api.deepseek.com/v1/chat/completions',
        model: 'deepseek-chat',
        envKey: 'DEEPSEEK_API_KEY',
        maxTokensField: 'max_tokens',
        maxTokens: 10000,
        temperature: 1,
        vision: true
    },
    minimax: {
        url: 'https://api.minimaxi.chat/v1/text/chatcompletion_v2',
        model: 'MiniMax-M2.7',
        envKey: 'MINIMAX_API_KEY',
        maxTokensField: 'max_tokens',
        maxTokens: 10000,
        temperature: 1,
        vision: true
    },
    gpt_oss_120b: {
        url: 'https://api.cerebras.ai/v1/chat/completions',
        model: 'gpt-oss-120b',
        envKey: 'CEREBRAS_API_KEY',
        maxTokensField: 'max_completion_tokens',
        maxTokens: 10000,
        temperature: 1,
        vision: false
    },
    qwen_3: {
        url: 'https://api.cerebras.ai/v1/chat/completions',
        model: 'qwen-3-235b-a22b-instruct-2507',
        envKey: 'CEREBRAS_API_KEY',
        maxTokensField: 'max_completion_tokens',
        maxTokens: 10000,
        temperature: 1,
        vision: false
    },
    llama_31_8b: {
        url: 'https://api.cerebras.ai/v1/chat/completions',
        model: 'llama3.1-8b',
        envKey: 'CEREBRAS_API_KEY',
        maxTokensField: 'max_completion_tokens',
        maxTokens: 10000,
        temperature: 1,
        vision: false
    },
    qwen_3_vl: {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        model: 'qwen/qwen3-vl-30b-a3b-thinking',
        envKey: 'OPENROUTER_API_KEY',
        maxTokensField: 'max_tokens',
        maxTokens: 10000,
        temperature: 1,
        vision: true,
        reasoning: { effort: 'medium' }
    },
    gemma_4_31b: {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        model: 'google/gemma-4-31b-it:free',
        envKey: 'OPENROUTER_API_KEY',
        maxTokensField: 'max_tokens',
        maxTokens: 10000,
        temperature: 1,
        vision: true,
        reasoning: { effort: 'low' }
    },
    gemma_4_26b: {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        model: 'google/gemma-4-26b-a4b-it:free',
        envKey: 'OPENROUTER_API_KEY',
        maxTokensField: 'max_tokens',
        maxTokens: 10000,
        temperature: 1,
        vision: true,
        reasoning: { effort: 'low' }
    },
    gemini_3_5_flash_lite: {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        model: 'google/gemini-3.5-flash-lite',
        envKey: 'OPENROUTER_API_KEY',
        maxTokensField: 'max_tokens',
        maxTokens: 10000,
        temperature: 1,
        vision: true,
        reasoning: { effort: 'low' }
    },
    gemini_3_1_flash_lite: {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        model: 'google/gemini-3.1-flash-lite',
        envKey: 'OPENROUTER_API_KEY',
        maxTokensField: 'max_tokens',
        maxTokens: 10000,
        temperature: 1,
        vision: true,
        reasoning: { effort: 'low' }
    },
    gemini_3_8_flash: {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        model: 'google/gemini-3.8-flash',
        envKey: 'OPENROUTER_API_KEY',
        maxTokensField: 'max_tokens',
        maxTokens: 10000,
        temperature: 1,
        vision: true,
        reasoning: { effort: 'low' }
    },
    gemini_3_7_flash: {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        model: 'google/gemini-3.7-flash',
        envKey: 'OPENROUTER_API_KEY',
        maxTokensField: 'max_tokens',
        maxTokens: 10000,
        temperature: 1,
        vision: true,
        reasoning: { effort: 'low' }
    },
    gemini_3_6_flash: {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        model: 'google/gemini-3.6-flash',
        envKey: 'OPENROUTER_API_KEY',
        maxTokensField: 'max_tokens',
        maxTokens: 10000,
        temperature: 1,
        vision: true,
        reasoning: { effort: 'low' }
    },
    muse_spark_1_3: {
        url: 'https://api.meta.ai/v1/chat/completions',
        model: 'muse-spark-1.3-contributor',
        envKey: 'META_API_KEY',
        maxTokensField: 'max_completion_tokens',
        maxTokens: 10000,
        temperature: 1,
        vision: true,
        // reasoning: { effort: 'low' } // should be reasoning_effort for muse but not supporting it for now
        reasoning_effort: 'minimal'
    }
};

module.exports = { PROVIDERS };
