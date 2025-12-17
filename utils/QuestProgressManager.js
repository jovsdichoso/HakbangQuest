/**
 * Unified Quest Progress Manager
 * Handles baseline vs session progress consistently across all screens
 */

export class QuestProgressManager {
    /**
     * Convert quest progress percentage to raw value
     * @param {Object} quest - Quest object with progress (0-1) and goal
     * @returns {number} Raw progress value
     */
    static getBaselineValue(quest) {
        if (!quest || !quest.goal) return 0
        const progressPercentage = quest.progress || 0
        return progressPercentage * quest.goal
    }

    /**
     * Calculate session progress value from current stats
     * @param {Object} quest - Quest object
     * @param {Object} stats - Current session stats
     * @param {number} calories - Current session calories
     * @returns {number} Session progress value in quest units
     */
    static getSessionValue(quest, stats = {}, calories = 0) {
        if (!quest) return 0

        switch (quest.unit) {
            case "steps":
                return Number(stats.steps) || 0
            case "reps":
                return Number(stats.reps) || 0
            case "distance":
            case "km":
                return (Number(stats.distance) || 0) / 1000
            case "duration":
            case "minutes":
                return (Number(stats.duration) || 0) / 60
            case "calories":
                return Number(calories) || 0
            case "pace":
                return Number(stats.pace) || 0
            default:
                return 0
        }
    }


    /**
     * Calculate total progress value (baseline + session)
     * @param {Object} quest - Quest object
     * @param {Object} stats - Current session stats
     * @param {number} calories - Current session calories
     * @returns {number} Total progress value
     */
    static getTotalValue(quest, stats = {}, calories = 0) {
        const baselineValue = this.getBaselineValue(quest)
        const sessionValue = this.getSessionValue(quest, stats, calories)
        return baselineValue + sessionValue
    }

    /**
     * Calculate progress percentage (0-1)
     * @param {Object} quest - Quest object
     * @param {Object} stats - Current session stats
     * @param {number} calories - Current session calories
     * @returns {number} Progress percentage (0-1)
     */
    static getProgressPercentage(quest, stats = {}, calories = 0) {
        if (!quest || !quest.goal) return 0
        const totalValue = this.getTotalValue(quest, stats, calories)
        return Math.min(totalValue / quest.goal, 1)
    }

    /**
     * Get quest status based on progress
     * @param {Object} quest - Quest object
     * @param {Object} stats - Current session stats
     * @param {number} calories - Current session calories
     * @returns {string} Quest status: 'not_started', 'in_progress', 'completed'
     */
    static getQuestStatus(quest, stats = {}, calories = 0) {
        const progress = this.getProgressPercentage(quest, stats, calories)
        if (progress >= 1) return "completed"
        if (progress > 0) return "in_progress"
        return "not_started"
    }

    /**
     * Reset session progress while preserving baseline
     * @param {Object} quest - Quest object
     * @returns {Object} Quest with session reset but baseline preserved
     */
    static resetSession(quest) {
        if (!quest) return null
        return {
            ...quest,
            // Keep baseline progress, reset status only if it was in_progress
            status: quest.status === "completed" ? "completed" : "not_started",
        }
    }

    /**
     * Update quest with new session completion
     * @param {Object} quest - Quest object
     * @param {Object} activityStats - Completed activity stats
     * @param {number} calories - Activity calories
     * @returns {Object} Updated quest object
     */
    static updateQuestWithActivity(quest, activityStats, calories = 0) {
        if (!quest) return null

        const sessionStats = { ...activityStats }
        if (quest.unit === "distance" || quest.unit === "km") {
            // Convert distance from meters to kilometers if needed
            if (sessionStats.distance && sessionStats.distance > 100) {
                console.log(
                    "[v0] Converting distance from meters to km:",
                    sessionStats.distance,
                    "->",
                    sessionStats.distance / 1000,
                )
                sessionStats.distance = sessionStats.distance / 1000
            }
        }

        const currentProgress = this.getBaselineValue(quest)
        const sessionValue = this.getSessionValue(quest, sessionStats, calories)
        const newTotalValue = currentProgress + sessionValue
        const newProgress = Math.min(newTotalValue / quest.goal, 1)
        const newStatus = this.getQuestStatus(quest, sessionStats, calories)

        console.log("[v0] QuestProgressManager: Updating quest with activity", {
            questId: quest.id,
            questUnit: quest.unit,
            questGoal: quest.goal,
            originalStats: activityStats,
            convertedStats: sessionStats,
            currentProgress,
            sessionValue,
            newTotalValue,
            newProgress,
            newStatus,
        })

        return {
            ...quest,
            progress: newProgress,
            status: newStatus,
        }
    }

    /**
     * Format progress display text
     * @param {Object} quest - Quest object
     * @param {Object} stats - Current session stats
     * @param {number} calories - Current session calories
     * @returns {string} Formatted progress text
     */
    static getProgressDisplayText(quest, stats = {}, calories = 0) {
        if (!quest) return "0/0"

        const totalValue = this.getTotalValue(quest, stats, calories)
        const goal = quest.goal || 0

        // Format based on unit
        let formattedTotal, formattedGoal
        if (quest.unit === "duration" || quest.unit === "minutes") {
            formattedTotal = Math.floor(totalValue)
            formattedGoal = Math.floor(goal)
        } else {
            formattedTotal = totalValue.toFixed(quest.unit === "distance" || quest.unit === "km" ? 2 : 0)
            formattedGoal = goal.toFixed(quest.unit === "distance" || quest.unit === "km" ? 2 : 0)
        }

        return `${formattedTotal}/${formattedGoal} ${quest.unit}`
    }
}
