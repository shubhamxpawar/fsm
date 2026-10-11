import type { ExtensionMessage, ExtensionResponse } from "./contracts.js";

export function sendExtensionMessage<T>(
  message: ExtensionMessage,
): Promise<ExtensionResponse<T>> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(response as ExtensionResponse<T>);
    });
  });
}
