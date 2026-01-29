// xpManager.js - COMPLETE VERSION WITH ELEVATION BONUS & MET-BASED DIFFICULTY XP

import { doc, runTransaction, serverTimestamp, collection, increment } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { ActivityTypeManager, ACTIVITY_TYPES } from "./ActivityTypeManager";
import { QuestProgressManager } from "./QuestProgressManager";
import { checkAllParticipantsSubmitted, finalizeChallengeImmediate } from "./CommunityBackend";
import QuestManager from "./QuestManager";

export class XPManager {

    /**
     * ✅ NEW: Get base XP multiplier based on activity MET value (intensity)
     * MET (Metabolic Equivalent of Task) indicates exercise intensity
     */
    static getActivityMultiplierByMET(activityType) {
        // Activity MET values and their XP multipliers
        const activityMETConfig = {
            // Cardio Activities
            'walking': { met: 3.5, multiplier: 1.0 },      // Easy - Base level
            'jogging': { met: 7.0, multiplier: 1.4 },      // Hard
            'running': { met: 8.0, multiplier: 1.6 },      // Very Hard
            'cycling': { met: 6.0, multiplier: 1.3 },      // Medium-Hard

            // Strength Activities
            'pushup': { met: 3.8, multiplier: 1.2 },       // Medium
            'push-ups': { met: 3.8, multiplier: 1.2 },
        };

        const config = activityMETConfig[activityType?.toLowerCase()];
        return config ? config.multiplier : 1.0;
    }

    /**
     * ✅ NEW: Calculate base XP with difficulty multiplier
     * Adjusted baseAmount to 100 to make point differences more visible.
     */
    static calculateBaseXP(activityType, isStrengthActivity) {
        const baseAmount = 100; // Increased base to highlight differences
        const multiplier = this.getActivityMultiplierByMET(activityType);
        const finalXP = Math.round(baseAmount * multiplier);

        console.log(`[XPManager] Base XP for ${activityType}: ${finalXP} (${multiplier}x multiplier)`);
        return finalXP;
    }

    static async awardXPForActivity({
        userId,
        activityId,
        activityData,
        stats,
        activityParams = {},
        questData = null,
        challengeData = null,
        isStrengthActivity = false,
    }) {
        console.log("[XPManager] Starting XP award process for activity:", activityId);

        try {
            return await runTransaction(db, async (transaction) => {
                const receiptRef = doc(db, "activity_receipts", activityId);
                const receiptDoc = await transaction.get(receiptRef);

                if (receiptDoc.exists()) {
                    console.log("[XPManager] XP already awarded for this activity");
                    const receiptData = receiptDoc.data();
                    return {
                        success: true,
                        alreadyAwarded: true,
                        xpEarned: receiptData.xpEarned,
                        questCompleted: receiptData.questCompleted || false,
                        challengeCompleted: receiptData.challengeCompleted || false,
                    };
                }

                const userRef = doc(db, "users", userId);
                const userDoc = await transaction.get(userRef);

                if (!userDoc.exists()) {
                    throw new Error("User document not found");
                }

                const userData = userDoc.data();

                let challengeDoc = null;
                let challengeRef = null;
                let challengeToUse = challengeData;

                if (challengeData && challengeData.id) {
                    challengeRef = doc(db, "challenges", challengeData.id);
                    challengeDoc = await transaction.get(challengeRef);

                    if (challengeDoc.exists()) {
                        challengeToUse = { ...challengeData, ...challengeDoc.data() };
                    } else {
                        challengeToUse = null;
                    }
                }

                const completionCheck = this.checkActivityCompletion(stats, isStrengthActivity, challengeToUse);
                if (!completionCheck.isComplete) {
                    return {
                        success: false,
                        reason: completionCheck.reason,
                        xpEarned: 0,
                    };
                }

                const typeConfig = ActivityTypeManager.determineActivityType({
                    ...activityParams,
                    activityType: activityData?.activityType || "normal"
                });

                const xpCalculation = this.calculateXPByType(
                    stats,
                    typeConfig,
                    questData,
                    challengeToUse,
                    isStrengthActivity
                );

                const currentTotalXP = userData.totalXP || userData.xp || 0;
                const currentLevel = userData.level || 1;
                const xpEarned = xpCalculation.totalXP;
                const newTotalXP = currentTotalXP + xpEarned;
                const newLevel = Math.floor(newTotalXP / 1000) + 1;
                const levelUp = newLevel > currentLevel;

                const userUpdateData = {
                    totalXP: newTotalXP,
                    level: newLevel,
                    lastActivityDate: serverTimestamp(),
                    totalActivities: increment(1),
                    updatedAt: serverTimestamp(),
                };

                if (userData.xp === undefined || userData.xp === null) {
                    userUpdateData.xp = xpEarned;
                } else {
                    userUpdateData.xp = increment(xpEarned);
                }

                const caloriesEarned = stats.calories || activityData.calories || 0;
                if (userData.totalCalories === undefined) {
                    userUpdateData.totalCalories = caloriesEarned;
                } else {
                    userUpdateData.totalCalories = increment(caloriesEarned);
                }

                if (isStrengthActivity) {
                    userUpdateData.totalReps = increment(stats.reps || 0);
                    userUpdateData.totalStrengthDuration = increment(stats.duration || 0);
                } else {
                    const distanceInKm = (stats.distance || 0) / 1000;
                    userUpdateData.totalDistance = increment(distanceInKm);
                    userUpdateData.totalSteps = increment(stats.steps || 0);
                    userUpdateData.totalDuration = increment(stats.duration || 0);
                }

                this.updateTypeSpecificStats(userUpdateData, typeConfig, xpCalculation);
                transaction.update(userRef, userUpdateData);

                const completeActivityData = {
                    ...activityData,
                    activityType: typeConfig.type,
                    xpEarned: xpEarned,
                    bonusXP: xpCalculation.bonusXP,
                    questCompleted: xpCalculation.questCompleted,
                    challengeCompleted: xpCalculation.challengeCompleted,
                    questId: questData?.id || null,
                    challengeId: challengeToUse?.id || null,
                    userId: userId,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                };

                const collectionName = this.getCollectionForActivityType(typeConfig.type);
                const activityRef = doc(db, collectionName, activityId);
                transaction.set(activityRef, completeActivityData);

                if (xpCalculation.questCompleted && questData) {
                    await this.handleQuestCompletion(
                        transaction,
                        userId,
                        questData,
                        typeConfig,
                        xpCalculation,
                        activityId,
                        stats,
                        isStrengthActivity,
                    );
                }

                if (challengeToUse && challengeDoc && challengeDoc.exists()) {
                    const challengeWasFinalized = await this.handleChallengeProgress(
                        transaction,
                        userId,
                        challengeToUse,
                        challengeDoc,
                        stats,
                        xpCalculation,
                        activityId,
                        isStrengthActivity,
                    );

                    if (challengeWasFinalized) {
                        xpCalculation.challengeCompleted = true;
                    }
                }

                const receiptData = {
                    userId,
                    activityId,
                    activityType: typeConfig.type,
                    xpEarned: xpEarned,
                    baseXP: xpCalculation.baseXP,
                    bonusXP: xpCalculation.bonusXP,
                    questXP: xpCalculation.questXP,
                    challengeXP: xpCalculation.challengeXP,
                    questCompleted: xpCalculation.questCompleted,
                    challengeCompleted: xpCalculation.challengeCompleted,
                    awardedAt: serverTimestamp(),
                };

                transaction.set(receiptRef, receiptData);

                return {
                    success: true,
                    xpEarned: xpEarned,
                    baseXP: xpCalculation.baseXP,
                    bonusXP: xpCalculation.bonusXP,
                    questCompleted: xpCalculation.questCompleted,
                    challengeCompleted: xpCalculation.challengeCompleted,
                    levelUp,
                    newLevel,
                };
            });
        } catch (error) {
            console.error("[XPManager] ❌ Error awarding XP:", error);
            return {
                success: false,
                reason: "Failed to process activity."
            };
        }
    }

    static getCollectionForActivityType(activityType) {
        switch (activityType) {
            case ACTIVITY_TYPES.CHALLENGE: return "challenge_activities";
            case ACTIVITY_TYPES.QUEST: return "quest_activities";
            default: return "normal_activities";
        }
    }

    static calculateXPByType(stats, typeConfig, questData, challengeData, isStrengthActivity) {
        const isNonChallengeQuest = typeConfig.type === ACTIVITY_TYPES.QUEST && !challengeData;
        const isNormalActivity = typeConfig.type === 'normal';

        let questXP = 0;
        let questCompleted = false;
        let achievedValue = 0;

        if (questData) {
            const questResult = this.calculateQuestXP(stats, questData, isStrengthActivity);
            questCompleted = questResult.completed;
            achievedValue = questResult.achievedValue;

            if (isNonChallengeQuest && questCompleted) {
                questXP = questResult.xp;
            }
        }

        const activityType = stats.activityType || typeConfig.activityType || 'walking';
        const baseXP = isNormalActivity ? this.calculateBaseXP(activityType, isStrengthActivity) : 0;
        const bonusXP = isNormalActivity ? this.calculatePerformanceBonusXP(stats, isStrengthActivity) : 0;

        let challengeXP = 0;
        let challengeCompleted = false;

        if (challengeData && !isNonChallengeQuest) {
            const challengeResult = this.calculateChallengeXP(stats, challengeData, isStrengthActivity);
            challengeCompleted = challengeResult.completed;
            challengeXP = challengeResult.xp;
        }

        let totalXP = baseXP + bonusXP + questXP + challengeXP;

        if (challengeData?.groupType && challengeData?.groupType !== 'solo') {
            totalXP = 0;
        }

        return {
            baseXP,
            bonusXP,
            questXP,
            challengeXP,
            totalXP,
            questCompleted,
            challengeCompleted,
            achievedValue,
        };
    }

    static calculateQuestXP(stats, questData, isStrengthActivity) {
        if (!questData) return { xp: 0, completed: false, achievedValue: 0 };

        const sessionStats = { ...stats };
        if (questData.unit === "distance") sessionStats.distance = sessionStats.distance || 0;
        else if (questData.unit === "steps") sessionStats.steps = sessionStats.steps || 0;
        else if (questData.unit === "reps") sessionStats.reps = sessionStats.reps || 0;
        else if (questData.unit === "duration") sessionStats.duration = sessionStats.duration || 0;

        const progressPercentage = QuestProgressManager.getProgressPercentage(
            questData,
            sessionStats,
            stats.calories || 0
        );

        const completed = progressPercentage >= 0.99;
        const xp = completed ? (questData.xpReward || 50) : 0;
        const achievedValue = QuestProgressManager.getTotalValue(questData, sessionStats, stats.calories || 0);

        return { xp, completed, achievedValue };
    }

    static calculateChallengeXP(stats, challengeData, isStrengthActivity) {
        if (!challengeData) return { xp: 0, completed: false };
        if (challengeData.groupType !== 'solo' && challengeData.stakeXP) return { xp: 0, completed: false };

        const progressValue = this.getProgressValueForChallenge(stats, challengeData, isStrengthActivity);
        const goal = challengeData.goal || 0;
        const completed = goal > 0 && progressValue >= goal;
        const xp = completed ? (challengeData.xpReward || 100) : 0;

        return { xp, completed };
    }

    static getProgressValueForChallenge(stats, challengeData, isStrengthActivity) {
        const unit = challengeData.unit?.toLowerCase() || "";
        switch (unit) {
            case "reps": return stats.reps || 0;
            case "distance":
            case "km": return isStrengthActivity ? 0 : (stats.distance || 0) / 1000;
            case "duration":
            case "minutes": return (stats.duration || 0) / 60;
            case "steps": return stats.steps || 0;
            case "calories": return stats.calories || 0;
            default: return 0;
        }
    }

    static async handleQuestCompletion(transaction, userId, questData, typeConfig, xpCalculation, activityId, stats, isStrengthActivity) {
        try {
            if (questData.id) {
                const activityData = {
                    reps: stats.reps || 0,
                    distance: stats.distance || 0,
                    duration: stats.duration || 0,
                    calories: stats.calories || 0,
                    steps: stats.steps || 0,
                };
                setTimeout(async () => {
                    try {
                        await QuestManager.updateQuestProgress(questData.id, activityData, activityId);
                    } catch (e) { console.error(e); }
                }, 100);
            }

            const questCompletionRef = doc(db, "quest_completions", `${userId}_${questData.id}_${Date.now()}`);
            const achievedValue = QuestProgressManager.getTotalValue(questData, stats, stats.calories || 0);

            transaction.set(questCompletionRef, {
                questId: questData.id,
                userId,
                questTitle: questData.title,
                questDescription: questData.description,
                achievedValue,
                activityType: typeConfig.type,
                xpEarned: questData.xpReward || 50,
                completed: true,
                completedAt: serverTimestamp(),
                activityId,
                isFromChallenge: typeConfig.type === ACTIVITY_TYPES.CHALLENGE,
                challengeId: typeConfig.challengeId || null,
            });

            if (questData.progressField) {
                const userRef = doc(db, "users", userId);
                transaction.update(userRef, {
                    [questData.progressField]: increment(achievedValue),
                });
            }
        } catch (error) { console.error(error); }
    }

    static async handleChallengeProgress(transaction, userId, challengeData, challengeDoc, stats, xpCalculation, activityId, isStrengthActivity) {
        try {
            if (!challengeDoc || !challengeDoc.exists()) return false;

            const challengeRef = challengeDoc.ref;
            const challenge = challengeDoc.data();
            if (challenge.status?.global === "completed") return false;

            let progressValue = this.getProgressValueForChallenge(stats, challenge, isStrengthActivity);
            const currentProgress = challenge.progress?.[userId] || 0;
            const newProgress = currentProgress + progressValue;
            const goal = challenge.goal || 0;
            const isCompletedByGoal = goal > 0 && newProgress >= goal;
            const newUserStatus = isCompletedByGoal ? "completed" : "in_progress";

            const updatedProgressMap = { ...challenge.progress };
            updatedProgressMap[userId] = newProgress;

            transaction.update(challengeRef, {
                [`progress.${userId}`]: newProgress,
                [`status.${userId}`]: newUserStatus,
                lastUpdated: serverTimestamp(),
            });

            const participationRef = doc(collection(db, "challenge_participations"));
            transaction.set(participationRef, {
                challengeId: challengeData.id,
                userId,
                activityId,
                progressValue,
                totalProgress: newProgress,
                completed: isCompletedByGoal,
                participatedAt: serverTimestamp(),
            });

            const isImmediateFinalizationType =
                challengeData.groupType === "duo" &&
                challengeData.completionRequirement === "betterthanothers" &&
                challengeData.participants?.length === 2;

            if (isImmediateFinalizationType) {
                if (checkAllParticipantsSubmitted({ ...challengeData, progress: updatedProgressMap })) {
                    try {
                        const updatedChallengeData = { ...challengeData, progress: updatedProgressMap };
                        await finalizeChallengeImmediate(transaction, challengeRef, updatedChallengeData);
                        return true;
                    } catch (e) { return false; }
                }
            }

            if (challengeData.groupType === 'solo' && isCompletedByGoal) {
                transaction.update(challengeRef, {
                    'status.global': 'completed',
                    winnerId: userId,
                    updatedAt: serverTimestamp(),
                });
                return true;
            }

            return false;
        } catch (error) { return false; }
    }

    static updateTypeSpecificStats(userUpdateData, typeConfig, xpCalculation) {
        switch (typeConfig.type) {
            case ACTIVITY_TYPES.CHALLENGE:
                userUpdateData.totalChallengeActivities = increment(1);
                if (xpCalculation.challengeCompleted) userUpdateData.completedChallenges = increment(1);
                break;
            case ACTIVITY_TYPES.QUEST:
                userUpdateData.totalQuestActivities = increment(1);
                if (xpCalculation.questCompleted) userUpdateData.completedQuests = increment(1);
                break;
            default:
                userUpdateData.totalNormalActivities = increment(1);
        }
    }

    static checkActivityCompletion(stats, isStrengthActivity, challengeData = null) {
        const isTimeChallenge = challengeData?.mode === 'time' || challengeData?.unit === 'duration';

        if (isStrengthActivity) {
            if ((stats.reps || 0) < 1) return { isComplete: false, reason: "Minimum 1 repetition required" };
        } else if (isTimeChallenge) {
            if ((stats.duration || 0) < 10) return { isComplete: false, reason: "Minimum 10 seconds required" };
        } else {
            const distanceInKm = (stats.distance || 0) / 1000;
            if (distanceInKm < 0.01) return { isComplete: false, reason: "Minimum 0.01 km required" };
            if ((stats.duration || 0) < 10) return { isComplete: false, reason: "Minimum 10 seconds required" };
        }
        return { isComplete: true };
    }

    static calculatePerformanceBonusXP(stats, isStrengthActivity) {
        let bonusXP = 0;

        const multiplier = stats.activityType ? this.getActivityMultiplierByMET(stats.activityType) : 1.0;

        if (isStrengthActivity) {
            bonusXP += Math.floor((stats.reps || 0) / 5) * 1;
            bonusXP += Math.floor((stats.duration || 0) / 120) * 1;
        } else {
            const km = (stats.distance || 0) / 1000;

            bonusXP += Math.floor(km / 0.5) * Math.max(1, multiplier);

            bonusXP += Math.floor((stats.duration || 0) / 300) * multiplier;

            bonusXP += Math.floor((stats.steps || 0) / 500) * 1;

            const elevation = stats.elevationGain || 0;
            if (elevation > 0) {
                const elevationBonus = Math.min(Math.floor(elevation / 10) * 2, 50);
                bonusXP += elevationBonus;
            }
        }

        return Math.min(bonusXP, 150);
    }

    static generateActivityId(userId, sessionStartTime, activityType = "normal") {
        return `${userId}_${sessionStartTime}_${activityType}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

export default XPManager;