import * as Yup from "yup";
import AppError from "../../errors/AppError";
import Prompt from "../../models/Prompt";
import ShowPromptService from "./ShowPromptService";

interface PromptData {
    id?: number;
    name: string;
    apiKey?: string;
    prompt: string;
    maxTokens?: number;
    temperature?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    max_completion_tokens?: number;
    queueId?: number;
    maxMessages?: number;
    companyId: string | number;
    voice?: string;
    voiceKey?: string;
    voiceRegion?: string;
    model?: string;
    replyEngine?: string;
}

interface Request {
    promptData: PromptData;
    promptId: string | number;
    companyId: string | number;
}

const UpdatePromptService = async ({
    promptId,
    promptData,
    companyId
}: Request): Promise<Prompt | undefined> => {
    const promptTable = await ShowPromptService({ promptId: promptId, companyId });

    const promptSchema = Yup.object().shape({
        name: Yup.string().required("ERR_PROMPT_NAME_INVALID"),
        prompt: Yup.string().required("ERR_PROMPT_PROMPT_INVALID"),
        queueId: Yup.number().required("ERR_PROMPT_QUEUEID_INVALID"),
        maxMessages: Yup.number().required("ERR_PROMPT_MAX_MESSAGES_INVALID")
    });

    const { name, apiKey, prompt, maxTokens, temperature, promptTokens, completionTokens, totalTokens, max_completion_tokens, queueId, maxMessages, voice, voiceKey, voiceRegion, model, replyEngine } = promptData;

    try {
        await promptSchema.validate({ name, prompt, queueId, maxMessages });
    } catch (err) {
        throw new AppError(`${JSON.stringify(err, undefined, 2)}`);
    }

    await promptTable.update({ name, apiKey: apiKey || "", prompt, maxTokens, temperature, promptTokens, completionTokens, totalTokens, max_completion_tokens: max_completion_tokens || 0, queueId, maxMessages, voice, voiceKey, voiceRegion, model, replyEngine });
    await promptTable.reload();
    return promptTable;
};

export default UpdatePromptService;
