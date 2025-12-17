/**
 * Activity Type Manager
 * Handles the three distinct activity types:
 * 1. Normal Activity (Non-Quest)
 * 2. Quest Activity (From Dashboard)
 * 3. Challenge Activity (Quest from Challenge)
 */

export const ACTIVITY_TYPES = {
    NORMAL: "normal",
    QUEST: "quest",
    CHALLENGE: "challenge",
}

export const ACTIVITY_SOURCES = {
    DASHBOARD_DIRECT: "dashboard_direct",
    DASHBOARD_QUEST: "dashboard_quest",
    CHALLENGE_QUEST: "challenge_quest",
}

export class ActivityTypeManager {
    /**
     * Determine activity type based on parameters
     * @param {Object} params - Activity parameters
     * @returns {Object} Activity type configuration
     */
    static determineActivityType(params = {}) {
        const { questId, challengeId, source } = params

        // Challenge Activity (Quest from Challenge)
        if (challengeId && questId) {
            return {
                type: ACTIVITY_TYPES.CHALLENGE,
                source: ACTIVITY_SOURCES.CHALLENGE_QUEST,
                questId,
                challengeId,
                category: "challenge",
                requiresSpecialHandling: true,
            }
        }

        // Quest Activity (From Dashboard)
        if (questId && !challengeId) {
            return {
                type: ACTIVITY_TYPES.QUEST,
                source: ACTIVITY_SOURCES.DASHBOARD_QUEST,
                questId,
                challengeId: null,
                category: "quest",
                requiresSpecialHandling: true,
            }
        }

        // Normal Activity (Non-Quest)
        return {
            type: ACTIVITY_TYPES.NORMAL,
            source: ACTIVITY_SOURCES.DASHBOARD_DIRECT,
            questId: null,
            challengeId: null,
            category: "normal",
            requiresSpecialHandling: false,
        }
    }

    /**
     * Build activity data structure based on type
     * @param {Object} baseData - Base activity data
     * @param {Object} typeConfig - Activity type configuration
     * @param {Object} questData - Quest data (if applicable)
     * @param {Object} challengeData - Challenge data (if applicable)
     * @returns {Object} Complete activity data
     */
    static buildActivityData(baseData, typeConfig, questData = null, challengeData = null) {
        const activityData = {
            ...baseData,
            activityType: typeConfig.type,
            activitySource: typeConfig.source,
            category: typeConfig.category,
        }

        // Add quest-specific data
        if (typeConfig.questId && questData) {
            activityData.questId = typeConfig.questId
            activityData.questTitle = questData.title
            activityData.questDescription = questData.description
            activityData.questCategory = questData.category
            activityData.questGoal = questData.goal
            activityData.questUnit = questData.unit
            activityData.questXpReward = questData.xpReward
        }

        // Add challenge-specific data
        if (typeConfig.challengeId && challengeData) {
            activityData.challengeId = typeConfig.challengeId
            activityData.challengeTitle = challengeData.title
            activityData.challengeDescription = challengeData.description
            activityData.challengeMaxParticipants = challengeData.maxParticipants
            activityData.challengeEndDate = challengeData.endDate
        }

        return activityData
    }

    /**
     * Get storage collection based on activity type
     * @param {string} activityType - Activity type
     * @returns {string} Firestore collection name
     */
    static getStorageCollection(activityType) {
        switch (activityType) {
            case ACTIVITY_TYPES.CHALLENGE:
                return "challenge_activities"
            case ACTIVITY_TYPES.QUEST:
                return "quest_activities"
            case ACTIVITY_TYPES.NORMAL:
            default:
                return "activities"
        }
    }

    /**
     * Get UI display configuration for activity type
     * @param {string} activityType - Activity type
     * @returns {Object} UI configuration
     */
    static getUIConfig(activityType) {
        switch (activityType) {
            case ACTIVITY_TYPES.CHALLENGE:
                return {
                    badgeColor: "#9B5DE5",
                    badgeText: "Challenge",
                    badgeIcon: "trophy",
                    showProgress: true,
                    showLeaderboard: true,
                    filterTag: "challenge",
                }
            case ACTIVITY_TYPES.QUEST:
                return {
                    badgeColor: "#4361EE",
                    badgeText: "Quest",
                    badgeIcon: "flag",
                    showProgress: true,
                    showLeaderboard: false,
                    filterTag: "quest",
                }
            case ACTIVITY_TYPES.NORMAL:
            default:
                return {
                    badgeColor: "#06D6A0",
                    badgeText: "Activity",
                    badgeIcon: "fitness",
                    showProgress: false,
                    showLeaderboard: false,
                    filterTag: "normal",
                }
        }
    }

    /**
     * Check if activity should update quest progress
     * @param {Object} typeConfig - Activity type configuration
     * @returns {boolean} Whether to update quest progress
     */
    static shouldUpdateQuestProgress(typeConfig) {
        return typeConfig.type === ACTIVITY_TYPES.QUEST || typeConfig.type === ACTIVITY_TYPES.CHALLENGE
    }

    /**
     * Check if activity should update challenge progress
     * @param {Object} typeConfig - Activity type configuration
     * @returns {boolean} Whether to update challenge progress
     */
    static shouldUpdateChallengeProgress(typeConfig) {
        return typeConfig.type === ACTIVITY_TYPES.CHALLENGE
    }

    /**
     * Get progress update targets
     * @param {Object} typeConfig - Activity type configuration
     * @returns {Object} Progress update configuration
     */
    static getProgressUpdateTargets(typeConfig) {
        return {
            updateQuest: this.shouldUpdateQuestProgress(typeConfig),
            updateChallenge: this.shouldUpdateChallengeProgress(typeConfig),
            updateUserStats: true, // Always update user stats
            questId: typeConfig.questId,
            challengeId: typeConfig.challengeId,
        }
    }
}
