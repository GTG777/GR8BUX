/**
 * Base Agent Class
 * Handles LLM communication via OpenAI
 */

import { generateText, getDefaultOpenAIModel } from '@/lib/openaiResponses';

export interface AgentConfig {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export class Agent {
  protected model: string;
  protected maxTokens: number;
  protected temperature: number;

  constructor(config: AgentConfig = {}) {
    this.model = config.model || getDefaultOpenAIModel();
    this.maxTokens = config.maxTokens || 1500;
    this.temperature = config.temperature || 0.7;
  }

  /**
   * Query the LLM with system context and user prompt
   */
  protected async query(
    prompt: string,
    systemContext: string,
    options: { maxTokens?: number; temperature?: number } = {}
  ): Promise<string> {
    try {
      const response = await generateText({
        model: this.model,
        maxOutputTokens: options.maxTokens || this.maxTokens,
        temperature: options.temperature || this.temperature,
        instructions: systemContext,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      if (response.text) {
        return response.text;
      }

      throw new Error('OpenAI returned an empty response');
    } catch (error) {
      console.error('[Agent Query Error]', error);
      throw error;
    }
  }

  /**
   * Parse JSON response from LLM
   */
  protected parseJsonResponse<T>(response: string): T {
    try {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
      const jsonString = jsonMatch ? jsonMatch[1] : response;
      return JSON.parse(jsonString);
    } catch (error) {
      console.error('[JSON Parse Error]', error);
      throw new Error(`Failed to parse agent response as JSON: ${response.substring(0, 200)}`);
    }
  }

  /**
   * Format technical data for LLM consumption
   */
  protected formatTechnicalContext(data: any): string {
    return JSON.stringify(data, null, 2);
  }
}
