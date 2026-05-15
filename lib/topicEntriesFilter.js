import { tvAutomationGroupHasNonEmptySteps } from "../../app/src/processData/tvAutomationSchema.js";

/**
 * Same rule as Overview automation: only topics with at least one step that has TV commands.
 * @param {Array<[string, unknown]>} topicEntries
 * @returns {Array<[string, unknown]>}
 */
export function filterTopicEntriesWithNonEmptySteps(topicEntries) {
  return topicEntries.filter(([, topicData]) => tvAutomationGroupHasNonEmptySteps(topicData));
}
