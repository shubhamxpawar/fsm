import { initializeExtension } from "./startup.js";
import { backgroundController } from "./background-controller.js";

chrome.runtime.onInstalled.addListener((details) => {
  void initializeExtension(details.reason === "update" ? "updated" : "installed").catch((error) => {
    console.error("Initialization failed.", error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  void initializeExtension("startup").catch((error) => {
    console.error("Initialization failed.", error);
  });
});

chrome.permissions.onAdded.addListener(() => {
  void initializeExtension("permissions-changed").catch((error) => {
    console.error("Initialization failed.", error);
  });
});

chrome.permissions.onRemoved.addListener(() => {
  void initializeExtension("permissions-changed").catch((error) => {
    console.error("Initialization failed.", error);
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  void backgroundController.handleAlarm(alarm).catch((error) => {
    console.error("Alarm handling failed.", error);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void backgroundController.handleMessage(message, sender).then(sendResponse, (error) => {
    console.error("Message handling failed.", error);
    sendResponse({ ok: false, error: "storage-failure" });
  });
  return true;
});
