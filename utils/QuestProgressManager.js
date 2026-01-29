/**
 * Unified Quest Progress Manager
 * Handles baseline vs session progress consistently across all screens
 */

export class QuestProgressManager {
    /**
     * Get baseline progress value from quest.progress
     * ✅ FIXED: quest.progress is already the actual value (e.g., 40 reps), NOT a percentage
     * @param {Object} quest - Quest object with progress and goal
     * @returns {number} Raw progress value
     */
    static getBaselineValue(quest) {
        if (!quest || !quest.goal) return 0;
        // ✅ quest.progress is the actual value (e.g., 40), not a percentage
        return quest.progress || 0;
    }

    /**
     * Calculate session progress value from current stats
     * @param {Object} quest - Quest object
     * @param {Object} stats - Current session stats
     * @param {number} calories - Current session calories
     * @returns {number} Session progress value in quest units
     */
    static getSessionValue(quest, stats = {}, calories = 0) {
        if (!quest) return 0;

        switch (quest.unit) {
            case "steps":
                return Number(stats.steps) || 0;
            case "reps":
                return Number(stats.reps) || 0;
            case "distance":
            case "km":
                return (Number(stats.distance) || 0) / 1000;
            case "duration":
            case "minutes":
                return (Number(stats.duration) || 0) / 60;
            case "calories":
                return Number(calories) || 0;
            case "pace":
                return Number(stats.pace) || 0;
            default:
                return 0;
        }
    }

    /**
     * Calculate total progress value (baseline + session)
     * ✅ FIXED: Now correctly adds baseline value + session value
     * @param {Object} quest - Quest object
     * @param {Object} stats - Current session stats
     * @param {number} calories - Current session calories
     * @returns {number} Total progress value
     */
    static getTotalValue(quest, stats = {}, calories = 0) {
        if (!quest) return 0;

        // ✅ quest.progress is the actual value (e.g., 40 reps), NOT a percentage
        const initialProgressValue = quest.progress || 0;
        
        let currentSessionValue = 0;
        
        if (quest.unit === 'steps') {
            currentSessionValue = Number(stats.steps) || 0;
        } else if (quest.unit === 'reps') {
            currentSessionValue = Number(stats.reps) || 0;
        } else if (quest.unit === 'distance' || quest.unit === 'km') {
            currentSessionValue = (Number(stats.distance) || 0) / 1000;
        } else if (quest.unit === 'duration' || quest.unit === 'minutes') {
            currentSessionValue = (Number(stats.duration) || 0) / 60;
        } else if (quest.unit === 'calories') {
            currentSessionValue = Number(calories) || 0;
        } else if (quest.unit === 'pace') {
            currentSessionValue = Number(stats.pace) || 0;
        }

        const totalAchievedValue = initialProgressValue + currentSessionValue;
        const goalValue = Number.parseFloat(quest.goal || 0);
        
        return Math.min(totalAchievedValue, goalValue);
    }

    /**
     * Calculate progress percentage (0-1)
     * ✅ FIXED: Now correctly calculates percentage from actual values
     * @param {Object} quest - Quest object
     * @param {Object} stats - Current session stats
     * @param {number} calories - Current session calories
     * @returns {number} Progress percentage (0-1)
     */
    static getProgressPercentage(quest, stats = {}, calories = 0) {
        if (!quest || !quest.goal) return 0;

        // ✅ quest.progress is the actual value (e.g., 40 reps), NOT a percentage
        const initialProgressValue = quest.progress || 0;
        
        let currentSessionValue = 0;
        
        if (quest.unit === 'steps') {
            currentSessionValue = Number(stats.steps) || 0;
        } else if (quest.unit === 'reps') {
            currentSessionValue = Number(stats.reps) || 0;
        } else if (quest.unit === 'distance' || quest.unit === 'km') {
            currentSessionValue = (Number(stats.distance) || 0) / 1000;
        } else if (quest.unit === 'duration' || quest.unit === 'minutes') {
            currentSessionValue = (Number(stats.duration) || 0) / 60;
        } else if (quest.unit === 'calories') {
            currentSessionValue = Number(calories) || 0;
        } else if (quest.unit === 'pace') {
            currentSessionValue = Number(stats.pace) || 0;
        }

        const totalAchievedValue = initialProgressValue + currentSessionValue;
        const goalValue = Number.parseFloat(quest.goal || 0);
        
        return goalValue > 0 ? Math.min(totalAchievedValue / goalValue, 1) : 0;
    }

    /**
     * Get quest status based on progress
     * @param {Object} quest - Quest object
     * @param {Object} stats - Current session stats
     * @param {number} calories - Current session calories
     * @returns {string} Quest status: 'not_started', 'in_progress', 'completed'
     */
    static getQuestStatus(quest, stats = {}, calories = 0) {
        const progress = this.getProgressPercentage(quest, stats, calories);
        if (progress >= 1) return "completed";
        if (progress > 0) return "in_progress";
        return "not_started";
    }

    /**
     * Reset session progress while preserving baseline
     * @param {Object} quest - Quest object
     * @returns {Object} Quest with session reset but baseline preserved
     */
    static resetSession(quest) {
        if (!quest) return null;
        return {
            ...quest,
            // Keep baseline progress, reset status only if it was in_progress
            status: quest.status === "completed" ? "completed" : "not_started",
        };
    }

    /**
     * Update quest with new session completion
     * ✅ This function already works correctly - no changes needed
     * @param {Object} quest - Quest object
     * @param {Object} activityStats - Completed activity stats
     * @param {number} calories - Activity calories
     * @returns {Object} Updated quest object
     */
    static updateQuestWithActivity(quest, activityStats, calories = 0) {
        if (!quest) return null;

        const sessionStats = { ...activityStats };
        if (quest.unit === "distance" || quest.unit === "km") {
            // Convert distance from meters to kilometers if needed
            if (sessionStats.distance && sessionStats.distance > 100) {
                console.log(
                    "[QuestProgressManager] Converting distance from meters to km:",
                    sessionStats.distance,
                    "->",
                    sessionStats.distance / 1000,
                );
                sessionStats.distance = sessionStats.distance / 1000;
            }
        }

        // ✅ Now uses the fixed getTotalValue and getProgressPercentage
        const currentProgress = this.getBaselineValue(quest);
        const sessionValue = this.getSessionValue(quest, sessionStats, calories);
        const newTotalValue = currentProgress + sessionValue;
        const newProgress = newTotalValue; // ✅ Store as actual value, not percentage
        const progressPercentage = this.getProgressPercentage(quest, sessionStats, calories);
        const newStatus = this.getQuestStatus(quest, sessionStats, calories);

        console.log("[QuestProgressManager] Updating quest with activity", {
            questId: quest.id,
            questUnit: quest.unit,
            questGoal: quest.goal,
            originalStats: activityStats,
            convertedStats: sessionStats,
            currentProgress,
            sessionValue,
            newTotalValue,
            newProgress,
            progressPercentage,
            newStatus,
        });

        return {
            ...quest,
            progress: newProgress, // ✅ Store actual value (e.g., 52), not percentage
            status: newStatus,
        };
    }

    /**
     * Format progress display text
     * @param {Object} quest - Quest object
     * @param {Object} stats - Current session stats
     * @param {number} calories - Current session calories
     * @returns {string} Formatted progress text
     */
    static getProgressDisplayText(quest, stats = {}, calories = 0) {
        if (!quest) return "0/0";

        const totalValue = this.getTotalValue(quest, stats, calories);
        const goal = quest.goal || 0;

        // Format based on unit
        let formattedTotal, formattedGoal;
        if (quest.unit === "duration" || quest.unit === "minutes") {
            formattedTotal = Math.floor(totalValue);
            formattedGoal = Math.floor(goal);
        } else {
            formattedTotal = totalValue.toFixed(quest.unit === "distance" || quest.unit === "km" ? 2 : 0);
            formattedGoal = goal.toFixed(quest.unit === "distance" || quest.unit === "km" ? 2 : 0);
        }

        return `${formattedTotal}/${formattedGoal} ${quest.unit}`;
    }
}
