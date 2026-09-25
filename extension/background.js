// Clicking the toolbar button opens PlanBreeze's capture page for the current tab.
// PlanBreeze reads the page (schema.org event data, or Breeze as a fallback) and you confirm the details.
const APP_URL = "https://planbreeze.com"; // change to http://localhost:3000 for local development

chrome.action.onClicked.addListener((tab) => {
  if (!tab.url || !/^https?:/.test(tab.url)) return;
  chrome.tabs.create({ url: `${APP_URL}/capture?url=${encodeURIComponent(tab.url)}` });
});
