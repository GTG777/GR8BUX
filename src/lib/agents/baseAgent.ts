/**
 * Base Agent Class
 * Handles LLM communication via Anthropic Claude
 */

import Anthropic from '@anthropic-ai/sdk';

export interface AgentConfig {
  model?: 'claude-opus-4-1' | 'claude-3-5-sonnet-20241022' | 'claude-3-5-haiku-20241022';
  maxTokens?: number;
  temperature?: number;
}

export class Agent {
  protected client: Anthropic;
  protected model: string;
  protected maxTokens: number;
  protected temperature: number;

  constructor(config: AgentConfig = {}) {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.model = config.model || 'claude-3-5-sonnet-20241022';
    this.maxTokens = config.maxTokens || 2000;
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
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: options.maxTokens || this.maxTokens,
        temperature: options.temperature || this.temperature,
        system: systemContext,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      if (response.content[0].type === 'text') {
        return response.content[0].text;
      }

      throw new Error('Unexpected response type from Claude');
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
